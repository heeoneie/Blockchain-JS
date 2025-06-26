import { Response } from 'express'
import { CoreError } from './core/error'
import { Result } from './libs/jinx/result'

export const responseWith = <T, E>({
                                       res,
                                       result,
                                       success,
                                   }: {
    res: Response
    result: Result<T, CoreError>
    success: (t: T) => any
}) => {
    result.forEach({
        Ok: (t) => res.json(success(t)),
        Err: (e) => coreErrorToWebResponse(res, e),
    })
}

export const coreErrorToWebResponse = (res: Response, e: CoreError): any => {
    res.json(map(e))
}

const map = (e: CoreError): any => {
    switch (e.type) {
        case 'InsufficientBalance':
            return {
                note: `Transaction declined due to insufficient funds. balance=${e.balance}`,
            }
        case 'AddressNotFound':
            return {
                note: `Address(${e.address}) was not found`
            }
        case 'ProofFailed':
            return {
                note: `Proof of work failed`,
            }
    }
}
