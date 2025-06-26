import { Default } from './default'
import { Result } from './result'

export const ResultExtension = {
    unwrapOrDefault<T>(result: Result<Default<T>, any>): T {
        return result.mapEach({
            Ok: (value) => value,
            Err: (err) => err.default(),
        })
    },
}
