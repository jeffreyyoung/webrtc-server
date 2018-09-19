export class Completable<T> {
    promise: Promise<T>;
    private _resolve?: (T) => void;
    private _reject?: (T) => void;

    constructor() {
        let self = this;
        this.promise = new Promise((resolveIn, rejectIn) => {
            this._resolve = resolveIn;
            this._reject = rejectIn;
        });
    }

    reject(args: T) {
        if (this._reject) {
            this._reject(args);
        }
    }

    resolve(args: T) {
        if (this._resolve) {
            this._resolve(args);
        }
    }

}