import express from 'express'
const app = express()
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid'
import Blockchain from './core/blockchain'
import { IBlockchain } from './core/iBlockchain'
import rp from 'request-promise'
import { coreErrorToWebResponse, responseWith } from './response-mapper'
import { Block } from './types/Block'
import { List } from 'immutable'
import path from 'path'

const port = parseInt(process.argv[2])
if (!port || port < 1 || port > 65535) {
    console.error('Please provide a valid port number')
    process.exit(1)
}
const nodeAddress = uuidv4().split('-').join('')

const bitcoin = new Blockchain() as IBlockchain

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

app.get('/healthcheck', (req, res) => {
    res.send('ok')
})

// get entire blockchain
app.get('/blockchain', function (req, res) {
    res.send(bitcoin)
})

// create a new transaction
app.post('/transaction', function (req, res) {
    const newTransaction = req.body
    if (!newTransaction.amount || !newTransaction.sender || !newTransaction.recipient) {
        res.status(400).json({ error: 'Missing required transaction fields' })
        return
    }
    if (typeof newTransaction.amount !== 'number' || newTransaction.amount <= 0) {
        res.status(400).json({ error: 'Invalid amount' })
        return
    }
    if (typeof newTransaction.sender !== 'string' || typeof newTransaction.recipient !== 'string') {
        res.status(400).json({ error: 'Invalid sender or recipient' })
        return
    }
    bitcoin.addTransactionToPendingTransactions(newTransaction).let((result) => {
        responseWith({
            res,
            result,
            success: (blockIndex) => ({
                note: `Transaction will be added in block ${blockIndex}.`,
            }),
        })
    })
})

app.post('/transaction/broadcast', async function (req, res) {
    if (typeof req.body.amount !== 'number' || req.body.amount <= 0) {
        res.status(400).json({ error: 'Invalid amount' })
        return
    }
    const result = bitcoin.createNewTransaction(
        req.body.amount,
        req.body.sender,
        req.body.recipient
    )
    if (result.isErr) {
        coreErrorToWebResponse(res, result.unwrapErr())
        return
    }
    const newTransaction = result.unwrap()

    const addResult = bitcoin.addTransactionToPendingTransactions(newTransaction)
    if (addResult.isErr) {
        coreErrorToWebResponse(res, addResult.unwrapErr())
        return
    }
    const requestPromises = bitcoin.networkNodes.map((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true,
        }
        return rp(requestOptions)
    })

    try {
        await Promise.all(requestPromises)
        res.json({ note: 'Transaction created and broadcast successfully.' })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        res.status(500).json({ error: `Unexpected error: ${message}` })
    }
})

const parsedReward = process.env.MINING_REWARD ? parseFloat(process.env.MINING_REWARD) : null
const MINING_REWARD = parsedReward && !isNaN(parsedReward) ? parsedReward : 12.5
app.get('/mine', function (req, res) {
    const lastBlock = bitcoin.lastBlock
    const previousBlockHash = lastBlock.hash
    const currentBlockData = {
        transactions: bitcoin.pendingTransactions,
        index: lastBlock.index + 1,
    }

    const result = bitcoin.proofOfWork(previousBlockHash, currentBlockData)
    if (result.isErr) {
        coreErrorToWebResponse(res, result.unwrapErr())
        return
    }
    const nonce = result.unwrap()

    const blockHash = bitcoin.hashBlock(
        previousBlockHash,
        currentBlockData,
        nonce
    )
    const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash)

    const requestPromises = bitcoin.networkNodes.map((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock },
            json: true,
        }
        return rp(requestOptions)
    })

    Promise.all(requestPromises)
        .then(() => {
            const requestOptions = {
                uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
                method: 'POST',
                body: {
                    amount: MINING_REWARD,
                    sender: '00',
                    recipient: nodeAddress,
                },
                json: true,
            }
            return rp(requestOptions)
        })
        .then(() => {
            res.json({
                note: 'New block mined & broadcast successfully',
                block: newBlock,
            })
        })
        .catch((e) => res.json({ note: `Unexpected error: ${e}` }))
})

app.post('/receive-new-block', function (req, res) {
    const newBlock = req.body.newBlock as Block
    const lastBlock = bitcoin.lastBlock
    const correctHash = lastBlock.hash === newBlock.previousBlockHash
    const correctIndex = lastBlock.index + 1 === newBlock.index

    if (correctHash && correctIndex) {
        const blockHash = bitcoin.hashBlock(
            newBlock.previousBlockHash,
            { transactions: newBlock.transactions, index: newBlock.index },
            newBlock.nonce
        )
        if (blockHash !== newBlock.hash) {
            res.status(400).json({ note: 'Invalid block hash' })
            return
        }
        bitcoin.chain = [...bitcoin.chain, newBlock]
        bitcoin.pendingTransactions = []
        res.json({
            note: 'New block received and accepted.',
            newBlock: newBlock,
        })
    } else {
        res.json({
            note: 'New block rejected.',
            newBlock: newBlock,
        })
    }
})

app.post('/register-and-broadcast-node', async function (req, res) {
    const newNodeUrl = req.body.newNodeUrl as string
    try {
        new URL(newNodeUrl)
    } catch {
        res.status(400).json({ error: 'Invalid URL format' })
        return
    }

    if (bitcoin.currentNodeUrl === newNodeUrl) {
        res.json({ note: `Current node cannot be registered` })
        return
    }

    try {
        await rp({
            uri: newNodeUrl + '/healthcheck',
            method: 'GET',
        })

        if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1) {
            bitcoin.networkNodes.push(newNodeUrl)
        }

        const regNodesPromises = bitcoin.networkNodes.map((networkNodeUrl) => {
            const requestOptions = {
                uri: networkNodeUrl + '/register-node',
                method: 'POST',
                body: { newNodeUrl },
                json: true,
            }
            return rp(requestOptions)
        })
        await Promise.all(regNodesPromises)

        const bulkRegisterOptions = {
            uri: newNodeUrl + '/register-nodes-bulk',
            method: 'POST',
            body: {
                allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl],
            },
            json: true,
        }
        await rp(bulkRegisterOptions)
        res.json({ note: 'New node registered with network successfully.' })

    } catch (e: any) {
        if (e.statusCode === undefined) {
            res.json({ note: `The node doesn't respond` })
        } else {
            res.json({ note: `Unexpected error: ${e}` })
        }
    }
})

app.post('/register-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl as string
    const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1
    const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl
    if (nodeNotAlreadyPresent && notCurrentNode) {
        bitcoin.networkNodes.push(newNodeUrl)
        res.json({ note: 'New node registered successfully.' })
    } else {
        res.json({
            note: 'Nothing happened because the node was already registered.',
        })
    }
})

app.post('/register-nodes-bulk', function (req, res) {
    const allNetworkNodes = req.body.allNetworkNodes as string[]
    allNetworkNodes.forEach((networkNodeUrl) => {
        const nodeNotAlreadyPresent =
            bitcoin.networkNodes.indexOf(networkNodeUrl) == -1
        const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl
        if (nodeNotAlreadyPresent && notCurrentNode)
            bitcoin.networkNodes.push(networkNodeUrl)
    })
    res.json({ note: 'Bulk registration successful.' })
})

app.get('/consensus', function (_req, res) {
    const requestPromises = bitcoin.networkNodes.map((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/blockchain',
            method: 'GET',
            json: true,
        }

        return rp(requestOptions)
    })

    Promise.all(requestPromises).then((blockchains: IBlockchain[]) => {
        const longestNode = List(blockchains).maxBy((c) => c.chain.length)
        const newLongestChain = longestNode?.chain

        if (
            !newLongestChain ||
            (newLongestChain && bitcoin.chainIsValid(newLongestChain).isErr)
        ) {
            res.json({
                note: 'Current chain has not been replaced.',
                chain: bitcoin.chain,
            })
        } else {
            const newPendingTransactions = longestNode.pendingTransactions
            bitcoin.chain = newLongestChain
            bitcoin.pendingTransactions = newPendingTransactions
            res.json({
                note: 'This chain has been replaced.',
                chain: bitcoin.chain,
            })
        }
    }).catch((e) => {
        console.error('Consensus failed:', e)
        res.status(500).json({
            error: 'Failed to reach consensus with network nodes',
            chain: bitcoin.chain
        })
    })
})

app.get('/block/:blockHash', function (req, res) {
    const blockHash = req.params.blockHash
    bitcoin.getBlock(blockHash).forEach({
        Some: (correctBlock) => res.json({ block: correctBlock }),
        None: () => res.json({ note: 'Block not found by block hash' }), // Block not found by blockHash
    })
})

app.get('/transaction/:transactionId', function (req, res) {
    const transactionId = req.params.transactionId
    bitcoin.getTransaction(transactionId).forEach({
        Some: (t) => res.json({ transaction: t.transaction, block: t.block }),
        None: () => res.json({ note: 'Transaction not found by transaction id' }),
    })
})

app.get('/address/:address', function (req, res) {
    const address = req.params.address
    bitcoin.getAddressData(address).forEach({
        Some: (t) => res.json({ addressData: { addressTransactions: t.transactions, addressBalance: t.balance } }),
        None: () => res.json({ note: 'Address not found by id' }),
    })
})

app.get('/block-explorer', function (req, res) {
    const filePath = path.resolve(__dirname, 'block-explorer', 'index.html')
    res.sendFile(filePath)
})

app.listen(port, function () {
    console.log(`Listening on port ${port}...`)
})
