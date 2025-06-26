import express from 'express'
const app = express()
import bodyParser from 'body-parser'
import uuid from 'uuid'
import Blockchain from './core/blockchain'
import { IBlockchain } from './core/iBlockchain'
import rp from 'request-promise'
import { coreErrorToWebResponse, responseWith } from './response-mapper'
import { Block } from './types/Block'
import { List } from 'immutable'
const port = process.argv[2]
const nodeAddress = uuid.v1().split('-').join('')

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

app.post('/transaction/broadcast', function (req, res) {
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

    bitcoin.addTransactionToPendingTransactions(newTransaction)
    const requestPromises = bitcoin.networkNodes.map((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true,
        }
        return rp(requestOptions)
    })

    Promise.all(requestPromises)
        .then(() => {
            res.json({ note: 'Transaction created and broadcast successfully.' })
        })
        .catch((e) => {
            res.json({ note: `Unexpected error: ${e}` })
        })
})

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
                    amount: 12.5,
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
        bitcoin.chain.push(newBlock)
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

app.post('/register-and-broadcast-node', function (req, res) {
    const newNodeUrl = req.body.newNodeUrl as string

    if(bitcoin.currentNodeUrl === newNodeUrl) {
        res.json({ note: `Current node cannot be registered` });
        return;
    }

    // health check
    rp({
        uri: newNodeUrl + '/healthcheck',
        method: 'GET',
    }).then(() => {
        if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1)
            bitcoin.networkNodes.push(newNodeUrl)

        const regNodesPromises = bitcoin.networkNodes.map((networkNodeUrl) => {
            const requestOptions = {
                uri: networkNodeUrl + '/register-node',
                method: 'POST',
                body: { newNodeUrl },
                json: true,
            }

            rp(requestOptions)
        })

        Promise.all(regNodesPromises)
            .then(() => {
                const bulkRegisterOptions = {
                    uri: newNodeUrl + '/register-nodes-bulk',
                    method: 'POST',
                    body: {
                        allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl],
                    },
                    json: true,
                }
                return rp(bulkRegisterOptions)
            })
            .then(() => {
                res.json({ note: 'New node registered with network successfully.' })
            })
            .catch((e) => res.json({ note: `Unexpected error: ${e}` }))
    }).catch(() => {res.json({ note: `The node doesn't respond` })})
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
            (newLongestChain && !bitcoin.chainIsValid(newLongestChain))
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
    res.sendFile('./block-explorer/index.html', { root: __dirname })
})

app.listen(port, function () {
    console.log(`Listening on port ${port}...`)
})
