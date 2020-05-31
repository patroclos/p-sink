interface Subject<T> {
  iterator: AsyncGenerator<T>
  next: (value: T) => void
  error: (e: Error) => void
  terminate: () => void
}

export interface PSink<T> {
    push<TS extends T = T>(fn: () => Promise<TS>): Promise<TS>
    results: AsyncGenerator<T>
    errors: AsyncGenerator<Error>
    join(): Promise<void>
}

export interface PSinkConfig {
    maxConcurrency?: number
}

export function createPSink<T>(config: PSinkConfig): PSink<T> {
    interface Pending {
        job: () => Promise<T>
        onSucc: (r: T) => void
        onErr: (e: Error) => void
    }

    let { iterator, next, terminate } = createSubject<T>()
        let { iterator: iteratorE, next: nextE, terminate: terminateE } = createSubject<Error>();

    let { next: enqueue, terminate: closeQueue, iterator: mailbox } = createSubject<Pending>();
        async function pool() {
        let active = 0;

        let capacity = config.maxConcurrency || 1;
        let pending: Pending[] = [];

        async function runIt(job: Pending) {
            active++;
            try {
                let result = await job.job();
                next(result);
                job.onSucc(result);
            }
            catch (e) {
                nextE(e);
                job.onErr(e);
            }
            finally {
                active--;
                pullPending();
            }
        }

        async function pullPending() {
            let runners: Promise<void>[] = []
            while (active < capacity && pending.length > 0) {
                let job = pending.shift();
                if (job === undefined)
                    throw new Error('this is unexpected');
                runners.push(runIt(job));
            }

            return Promise.all(runners);
        }

        for await (let job of mailbox) {
            pending.push(job);
            if (active < capacity)
                pullPending();
        }

        terminateE();
        terminate();
    }
    const lifetime = pool();
    return {
        push<TS extends T = T>(job: () => Promise<TS>): Promise<TS> {
            return new Promise((a, r) => {
                enqueue({
                    job,
                    onSucc(result: T) {
                        a(<TS>result);
                    },
                    onErr(error) {
                        r(error);
                    }
                });
            });
        },
        errors: iteratorE,
        results: iterator,
        async join(): Promise<void> {
            closeQueue();
            await lifetime;
        }
    }
}

function createSubject<T>(buffer: T[] = []): Subject<T> {
  let $q = defer();
  let aborted = false;

  async function* generate(): AsyncGenerator<T> {
    while (!aborted) {
      await $q.promise;
      while (buffer.length) {
        const value = buffer.shift();
        if (value !== undefined)
          yield value;
      }
    }
  }

  function feed(value: T) {
    buffer.push(value);
    $q.resolve();
    $q = defer();
  }

  function error(e: Error) {
    $q.reject(e);
    $q = defer();
  }

  function terminate() {
    aborted = true;
    $q.resolve();
  }

  return { iterator: generate(), next: feed, error, terminate };
};

interface Deferred {
  promise: Promise<any>
  resolve(value?: any): void
  reject(error: Error): void
}
function defer() {
  let resolve, reject;

  const promise = new Promise((_1, _2) => {
    resolve = _1;
    reject = _2;
  });
  return {
    promise,
    resolve: <any>resolve,
    reject: <any>reject,
  };
}