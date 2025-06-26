export type CoreError =
    | { type: 'ProofFailed' }
    | { type: 'Uexpected'; cause?: any; message?: string }
    | { type: 'WrongHashBlock'; hash: string }
    | { type: 'InvalidOrderChain'; previousIndex: number; currentIndex: number }
    | { type: 'InvalidGenesisNonce'; expected: number; actual: number }
    | { type: 'InvalidGenesisPreviousHash'; expected: string; actual: string }
    | { type: 'GenesisHasTransaction' }
    | { type: 'BlockNotFoundByHash'; hash: string }
    | { type: 'InsufficientBalance'; balance: number }
    | { type: 'AddressNotFound'; address: string }
