import { Response } from 'express'
import { CoreError } from './core/error'
import { Result } from './libs/result'

export const responseWith = <T>({
                                       res,
                                       result,
                                       success,
                                   }: {
    res: Response
    result: Result<T, CoreError>
    success: (t: T) => object
}): void => {
    result.forEach({
        Ok: (t) => res.json(success(t)),
        Err: (e) => coreErrorToWebResponse(res, e),
    })
}
const getErrorStatusCode = (e: CoreError): number => {
    switch (e.type) {
        case 'InsufficientBalance':
            return 400;
        case 'AddressNotFound':
            return 404;
        case 'ProofFailed':
            return 422;
        default:
            return 500;
    }
};

export const coreErrorToWebResponse = (res: Response, e: CoreError): void => {
    const statusCode = getErrorStatusCode(e);
    res.status(statusCode).json(map(e));
}

interface ErrorResponse {
    note: string;
    errorType?: string;
}

const map = (e: CoreError): ErrorResponse => {
    switch (e.type) {
        case 'InsufficientBalance':
            return {
                note: `Transaction declined due to insufficient funds. balance=${e.balance}`,
                errorType: e.type,
            }
        case 'AddressNotFound':
            return {
                note: `Address(${e.address}) was not found`,
                errorType: e.type,
            }
        case 'ProofFailed':
            return {
                note: `Proof of work failed`,
                errorType: e.type,
            }
        default:
            return {
                note: 'An unexpected error occurred',
                    errorType: 'Unknown',
            }
    }
}
