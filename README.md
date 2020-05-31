[![npm version](https://badge.fury.io/js/p-sink.svg)](https://badge.fury.io/js/p-sink)

p-sink is a concurrency-limited promise-runner.

## How it werks

```typescript
import { createPSink } from 'p-sink'

// create runner
const sink = createPSink<number>({ maxConcurrency: 2 })

async function doStuff(): Promise<any> {
    // ...
}

sink.push(() => doStuff()).then(x => console.log('1'));

sink.push(() => doStuff()).then(x => console.log('2'));

sink.push(() => doStuff()).then(x => console.log('3'));

// close it
await sink.join();
```

## Async Generators
```typescript
for await (let item of sink.results)
    console.log(item)
```