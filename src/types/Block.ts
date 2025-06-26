import { Transaction } from './Transaction'

export type Block =  {
    index: number
    timestamp: number
    transactions: Transaction[]
    nonce: number
    hash: string
    previousBlockHash: string
}
