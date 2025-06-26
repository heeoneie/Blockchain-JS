import { Option } from '../libs/option'
import { Result } from '../libs/result'
import { Block } from '../types/Block'
import { Transaction } from '../types/Transaction'
import { CoreError } from './error'

export interface IBlockchain {
    get currentNodeUrl(): string
    networkNodes: string[]
    get lastBlock(): Block
    pendingTransactions: Transaction[]
    chain: Block[]
    createNewBlock(nonce: number, previousBlockHash: string, hash: string): Block
    createNewTransaction(
        amount: number,
        sender: string,
        recipient: string
    ): Result<Transaction, CoreError>
    addTransactionToPendingTransactions(
        transaction: Transaction
    ): Result<number, CoreError>
    hashBlock(
        previousBlockHash: string,
        currentBlockData: BlockData,
        nonce: number
    ): string
    proofOfWork(
        previousBlockHash: string,
        currentBlockData: BlockData
    ): Result<number, CoreError>
    chainIsValid(blockchain: Block[]): Result<void, CoreError>
    getBlock(blockHash: string): Option<Block>
    getTransaction(
        transactionId: string
    ): Option<{ block: Block; transaction: Transaction }>
    getAddressData(address: string): Option<{
        balance: number
        transactions: Transaction[]
    }>
}

export type BlockData = { index: number; transactions: Transaction[] }
