import { Option, none, nullable, some } from './option'

export interface Result<T, E> {
    get isOk(): boolean
    isOkAnd(f: (t: T) => boolean): boolean
    get isErr(): boolean
    isErrAnd(f: (e: E) => boolean): boolean
    ok(): Option<T>
    err(): Option<E>
    map<U>(op: (t: T) => U): Result<U, E>
    mapErr<O>(op: (e: E) => O): Result<T, O>
    mapOr<U>(_default: U, op: (t: T) => U): U
    mapOrElse<U>(_default: (e: E) => U, op: (t: T) => U): U
    inspect(f: (t: T) => any): Result<T, E>
    inspectErr(f: (e: E) => any): Result<T, E>
    expect(msg: string): T
    unwrap(): T
    unwrapOr(_default: T): T
    unwrapOrElse(_default: (e: E) => T): T
    expectErr(msg: string): E
    unwrapErr(): E
    and<U>(res: Result<U, E>): Result<U, E>
    andThen<U>(op: (t: T) => Result<U, E>): Result<U, E>
    or<F>(res: Result<T, F>): Result<T, F>
    orElse<F>(op: (e: E) => Result<T, F>): Result<T, F>
    transpose(): Option<Result<T, E>>
    let<U>(ext: (result: Result<T, E>) => U): U
    also(ext: (result: Result<T, E>) => void): Result<T, E>
    mapEach<U>(param: { Ok: (t: T) => U; Err: (e: E) => U }): U
    forEach(param: { Ok: (t: T) => any; Err: (e: E) => any }): void
}

abstract class ResultImplBase<T, E> implements Result<T, E> {
    abstract mapEach<U>(param: { Ok: (t: T) => U; Err: (err: E) => U }): U
    abstract forEach(param: { Ok: (t: T) => any; Err: (e: E) => any }): void

    get isOk(): boolean {
        return this.mapEach({
            Ok: () => true,
            Err: () => false,
        })
    }

    isOkAnd(f: (t: T) => boolean): boolean {
        return this.mapEach({
            Ok: (t) => f(t),
            Err: () => false,
        })
    }

    get isErr(): boolean {
        return !this.isOk
    }

    isErrAnd(f: (e: E) => boolean): boolean {
        return this.mapEach({
            Ok: () => false,
            Err: (e) => f(e),
        })
    }

    map<U>(op: (t: T) => U): Result<U, E> {
        return this.mapEach({
            Ok: (t) => ok(op(t)),
            Err: (e) => err(e),
        })
    }

    mapErr<O>(op: (e: E) => O): Result<T, O> {
        return this.mapEach({
            Ok: (t) => ok(t),
            Err: (e) => err(op(e)),
        })
    }

    mapOr<U>(_default: U, op: (t: T) => U): U {
        return this.mapEach({
            Ok: (t) => op(t),
            Err: () => _default,
        })
    }

    mapOrElse<U>(_default: (e: E) => U, op: (t: T) => U): U {
        return this.mapEach({
            Ok: (t) => op(t),
            Err: (e) => _default(e),
        })
    }

    inspect(f: (t: T) => any): Result<T, E> {
        this.mapEach({
            Ok: (t) => f(t),
            Err: () => {},
        })
        return this
    }

    inspectErr(f: (err: E) => any): Result<T, E> {
        this.mapEach({
            Ok: () => {},
            Err: (e) => f(e),
        })
        return this
    }

    expect(msg: string): T {
        return this.mapEach({
            Ok: (t) => t,
            Err: (e) => this.unwrapFailed(msg, e),
        })
    }

    unwrap(): T {
        return this.mapEach({
            Ok: (t) => t,
            Err: (e) =>
                this.unwrapFailed('called `Result::unwrap()` on an `Err` value', e),
        })
    }

    unwrapOr(_default: T): T {
        return this.mapEach({
            Ok: (t) => t,
            Err: () => _default,
        })
    }

    unwrapOrElse(_default: (err: E) => T): T {
        return this.mapEach({
            Ok: (t) => t,
            Err: (e) => _default(e),
        })
    }

    expectErr(msg: string): E {
        return this.mapEach({
            Ok: (t) => this.unwrapFailed(msg, t),
            Err: (e) => e,
        })
    }

    unwrapErr(): E {
        return this.mapEach({
            Ok: (t) =>
                this.unwrapFailed('called `Result::unwrap_err()` on an `Ok` value', t),
            Err: (e) => e,
        })
    }

    and<U>(res: Result<U, E>): Result<U, E> {
        return this.mapEach({
            Ok: () => res,
            Err: (e) => err(e),
        })
    }

    andThen<U>(op: (t: T) => Result<U, E>): Result<U, E> {
        return this.mapEach({
            Ok: (t) => op(t),
            Err: (e) => err(e),
        })
    }

    or<F>(res: Result<T, F>): Result<T, F> {
        return this.mapEach({
            Ok: (t) => ok(t),
            Err: () => res,
        })
    }

    orElse<F>(op: (e: E) => Result<T, F>): Result<T, F> {
        return this.mapEach({
            Ok: (t) => ok(t),
            Err: (e) => op(e),
        })
    }

    ok(): Option<T> {
        return this.mapEach({
            Ok: (t) => some(t),
            Err: () => none(),
        })
    }

    err(): Option<E> {
        return this.mapEach({
            Ok: () => none(),
            Err: (e) => some(e),
        })
    }

    transpose<U>(this: Result<Option<U>, E>): Option<Result<U, E>> {
        return this.mapEach({
            Ok: (opt) => opt.map((val) => ok(val)),
            Err: (e) => some(err(e)),
        })
    }

    let<U>(ext: (result: Result<T, E>) => U): U {
        return ext(this)
    }

    also(ext: (result: Result<T, E>) => void): Result<T, E> {
        ext(this)
        return this
    }

    protected unwrapFailed(msg: string, data: T | E): never {
        throw new Error(`${msg}: ${data}`)
    }
}

export class Ok<T, E> extends ResultImplBase<T, E> {
    constructor(private t: T) {
        super()
    }

    forEach({ Ok }: { Ok: (t: T) => any; Err: (e: E) => any }): void {
        Ok(this.t)
    }

    mapEach<U>({ Ok }: { Ok: (t: T) => U; Err: (err: E) => U }): U {
        return Ok(this.t)
    }
}

export class Err<T, E> extends ResultImplBase<T, E> {
    constructor(private e: E) {
        super()
    }

    forEach({ Err }: { Ok: (t: T) => any; Err: (e: E) => any }): void {
        Err(this.e)
    }

    mapEach<U>({ Err }: { Ok: (t: T) => U; Err: (err: E) => U }): U {
        return Err(this.e)
    }
}

export const ok = <T, E>(t: T): Result<T, E> => new Ok(t)
export const err = <T, E>(e: E): Result<T, E> => new Err(e)
