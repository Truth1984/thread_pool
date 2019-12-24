Auto-configured pool for worker threads, provides both thread and pool

## Usage

#### Use `--experimental-worker` flag while running the code.

```js
const Pool = require("thread_pools");

let ezpool = new Pool();
let pool = new Pool({
  threads: 2,
  importGlobal: `const os = require('os');`,
  waitMs: 1000,
  shareEnv: true
});

for (let i = 0; i < 10; i++) pool.threadPool(index => console.log(os.cpus().length + index), i);

pool.threadSingle(() => (process.env.returnType = "String")).then(() => console.log(process.env.returnType));
```

## features

1. Auto configured

2. Lazy initialze threads in thread pool

3. can use `console.log` inside thread function

## What's new

```
{
    1.3.0: Add shareEnv option
    1.2.1: Promise.all(threadPool(......)) is now viable
}
```

## Notice

- better initialize Pool only once and Store it in a global variable

- some libraries are unable to support `worker_threads`, like `bcrypt`

- `{SHARE_ENV}` in `worker_threads` may throw `DataCloneError: Symbol(nodejs.worker_threads.SHELL_ENV) could not be cloned` Error, thus using self-implemented methods.

- `process.env` will always return a <b>STRING</b> type, and `shareEnv` is a thread unsafe method, use with caution!

## API

### Pool(options)

```
{
    threads = if No. of cpu < 3, then 2, else (cpu No. * 2 - 2)
    importGlobal : import / require statement for every threads
    waitMs: Main Thread Promise Checker, check if the pool is open
    shareEnv: share process.env between all the threads, thread unsafe
}
```

### async threadSingle(func, ...param)

`func` : toString()able function, param : parameters of `func`

single thread runner, very expensive, auto closed.

### async threadPool(func, ...param)

`func` : toString()able function, param : parameters of `func`

use already initialized threads, expensive at the beginning but much faster than `threadSingle` for larger task
