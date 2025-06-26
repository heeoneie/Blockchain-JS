import { Result, err, ok } from './result'

export interface Option<T> {
    unwrap(): T
    map<U>(op: (t: T) => U): Option<U>
    mapEach<U>(param: { Some: (t: T) => U; None: () => U }): U
    forEach(param: { Some: (t: T) => any; None: () => any }): void
    someResult<RT, RE>(obj: { Ok: (t: T) => RT; Err: () => RE }): Result<RT, RE>
}

abstract class OptionImplBase<T> implements Option<T> {
    abstract mapEach<U>(param: { Some: (t: T) => U; None: () => U }): U

    forEach(param: { Some: (t: T) => any; None: () => any }): void {
        this.mapEach({
            Some: (t) => param.Some(t),
            None: () => param.None(),
        })
    }

    unwrap(): T {
        return this.mapEach({
            Some(t) {
                return t
            },
            None() {
                throw new Error('called `Option::unwrap()` on a `None` value')
            },
        })
    }

    map<U>(op: (t: T) => U): Option<U> {
        return this.mapEach({
            Some(t) {
                return some(op(t))
            },
            None() {
                return none()
            },
        })
    }

    someResult<RT, RE>(obj: { Ok: (t: T) => RT; Err: () => RE }): Result<RT, RE> {
        return this.mapEach({
            Some(t) {
                return ok(obj.Ok(t))
            },
            None() {
                return err(obj.Err())
            },
        })
    }
}

export class Some<T> extends OptionImplBase<T> {
    constructor(private t: T) {
        super()
    }

    mapEach<U>({ Some }: { Some: (t: T) => U; None: () => U }): U {
        return Some(this.t)
    }
}

export class None<T> extends OptionImplBase<T> {
    mapEach<U>({ None }: { Some: (t: T) => U; None: () => U }): U {
        return None()
    }
}

export const nullable = <T>(t: T | undefined | null): Option<T> => {
    if (t) {
        return new Some(t)
    } else {
        return new None()
    }
}

export const some = <T>(t: T): Option<T> => new Some(t)
export const none = <T>(): Option<T> => new None()
