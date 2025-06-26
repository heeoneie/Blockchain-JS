import sha256 from 'sha256'
import uuid from 'uuid'
import { Range } from 'immutable'
import { Result, err, ok } from '../libs/result'
import { CoreError } from './error'
import { Option, none, nullable, some } from '../libs/option'
import { BlockData, IBlockchain } from './iBlockchain'
import { Block } from '../types/Block'
import { Transaction } from '../types/Transaction'

export default class Blockchain implements IBlockchain {
    constructor(
        public chain: Block[] = [],
        public pendingTransactions: Transaction[] = [],
        private readonly _currentNodeUrl: string = process.argv[3] || 'http://localhost:3000',
        public networkNodes: string[] = []
    ) {
        this.createNewBlock(100, '0', '0')
    }

    get currentNodeUrl(): string {
        return this._currentNodeUrl
    }

    createNewBlock(
        nonce: number,
        previousBlockHash: string,
        hash: string
    ): Block {
        const newBlock: Block = {
            index: this.chain.length + 1,
            timestamp: Date.now(),
            transactions: this.pendingTransactions,
            nonce,
            hash,
            previousBlockHash,
        }
        this.pendingTransactions = []
        this.chain.push(newBlock)
        return newBlock
    }

    get lastBlock(): Block {
        return this.chain[this.chain.length - 1]
    }

    createNewTransaction(
        amount: number,
        sender: string,
        recipient: string
    ): Result<Transaction, CoreError> {
        return this.checkBalance({ address: sender, amount }).map(() => ({
            amount,
            sender,
            recipient,
            transactionId: uuid.v1().split('-').join(''),
        }))
    }

    addTransactionToPendingTransactions(
        transaction: Transaction
    ): Result<number, CoreError> {
        return this.checkBalance({
            address: transaction.sender,
            amount: transaction.amount,
        }).map(() => {
            this.pendingTransactions.push(transaction)
            return this.lastBlock.index + 1
        })
    }

    hashBlock(
        previousBlockHash: string,
        currentBlockData: BlockData,
        nonce: number
    ): string {
        const dataAsString =
            previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData)
        return sha256(dataAsString)
    }

    proofOfWork(
        previousBlockHash: string,
        currentBlockData: BlockData
    ): Result<number, CoreError> {
        const nonce = Range(0, Infinity).find(
            (nonce) =>
                this.hashBlock(previousBlockHash, currentBlockData, nonce).substring(
                    0,
                    4
                ) === '0000'
        )
        if (nonce) {
            return ok(nonce)
        } else {
            return err({ type: 'ProofFailed' })
        }
    }

    chainIsValid(blockchain: Block[]): Result<void, CoreError> {
        for (let i = 1; i < blockchain.length; i++) {
            const currentBlock = blockchain[i]
            const prevBlock = blockchain[i - 1]
            if (currentBlock.previousBlockHash !== prevBlock.hash) {
                return err({
                    type: 'InvalidOrderChain',
                    previousIndex: i - 1,
                    currentIndex: i,
                })
            }
            const blockHash = this.hashBlock(
                prevBlock.hash,
                {
                    transactions: currentBlock.transactions,
                    index: currentBlock.index,
                },
                currentBlock.nonce
            )
            if (blockHash.substring(0, 4) !== '0000') {
                return err({ type: 'WrongHashBlock', hash: blockHash })
            }
        }

        const genesisBlock = blockchain[0]
        if (genesisBlock.nonce !== 100) {
            return err({
                type: 'InvalidGenesisNonce',
                expected: 100,
                actual: genesisBlock.nonce,
            })
        }
        if (genesisBlock.previousBlockHash !== '0') {
            return err({
                type: 'InvalidGenesisPreviousHash',
                expected: '0',
                actual: genesisBlock.previousBlockHash,
            })
        }
        if (genesisBlock.transactions.length !== 0) {
            return err({
                type: 'GenesisHasTransaction',
            })
        }

        return ok(undefined)
    }

    getBlock(blockHash: string): Option<Block> {
        return nullable(this.chain.find((block) => block.hash === blockHash))
    }

    getTransaction(
        transactionId: string
    ): Option<{ block: Block; transaction: Transaction }> {
        return nullable(
            this.chain
                .flatMap((block) =>
                    block.transactions.map((transaction) => ({ transaction, block }))
                )
                .find((data) => data.transaction.transactionId === transactionId)
        )
    }

    getAddressData(address: string): Option<{
        balance: number
        transactions: Transaction[]
    }> {
        const transactions = this.chain
            .flatMap((block) => block.transactions)
            .filter(
                (transaction) =>
                    transaction.sender === address || transaction.recipient === address
            )
        if (transactions.length === 0) {
            return none()
        }
        const balance = transactions
            .map((transaction) =>
                transaction.recipient === address
                    ? transaction.amount
                    : -transaction.amount
            )
            .reduce((acc, curr) => acc + curr)
        return some({
            transactions,
            balance,
        })
    }
    private static readonly GENESIS_ADDRESS = '00'
    private checkBalance = ({
                                address,
                                amount,
                            }: {
        address: string
        amount: number
    }): Result<{}, CoreError> => {
        if (address == Blockchain.GENESIS_ADDRESS) {
            return ok({})
        }
        return this.getAddressData(address).mapEach({
            Some: ({ balance }) => {
                if (balance - amount < 0) {
                    return err({ type: 'InsufficientBalance', balance })
                }
                return ok({})
            },
            None: () => err({ type: 'AddressNotFound', address }),
        })
    }
}
