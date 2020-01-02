Auto-configured thread pool for worker_threads, provides both thread and pool function

## Usage

#### Use `--experimental-worker` flag while running the code.

```js
const Pool = require("thread_pools");

let ezpool = new Pool();
let pool = new Pool({
  threads: 2,
  importGlobal: `const os = require('os');`,
  waitMs: 1000
});

for (let i = 0; i < 10; i++) {
  pool.threadPool(index => console.log(os.cpus().length + index), i);
}

pool
  .threadSingle(() => {
    process.env.returnType = "String";
  })
  .then(() => console.log(process.env.returnType));

pool.threadSingleStoppable(() => {}).cancel();
```

## features

1. Auto configured

2. Lazy initialize threads in thread pool

3. can use `console.log` inside thread function

## What's new

```
{
    1.6.6: add console.warn/error, unify methods
    1.6.0: add stoppable thread single, pool, add test case
    1.4.0: support async function
    1.3.3: env is auto shared
    1.3.0: Add shareEnv option
    1.2.1: Promise.all(threadPool(......)) is now viable
}
```

## Notice

- better initialize Pool only once and Store it in a global variable

- some libraries are unable to support `worker_threads`, like `bcrypt`

- process.env is thread unsafe, use with caution.

- cancelling every thread after the execution of `threadPoolStoppable` is no different from `threadSingle`, and maybe slower

## API

### Pool(options)

```
{
    threads = if No. of cpu < 3, then 2, else (cpu No. * 2 - 2)
    importGlobal : import / require statement for every threads
    waitMs: Main Thread Promise Checker, check if the pool is open
}
```

### async threadSingle(func, ...param)

`func` : toStringable / cloneable function, param : parameters of `func`

single thread runner, very expensive, auto closed.

### async threadSingleStoppable(func, ...param)

return `{cancel:Function, result:Promise}`

### async threadPool(func, ...param)

`func` : toStringable / cloneable function, param : parameters of `func`

use already initialized threads, expensive at the beginning but much faster than `threadSingle` for larger task

### async threadPoolStoppable(func, ...param)

return `Promise<{cancel:Function, result:Promise}>`

`threadPoolStoppable().catch()` will not catch the error, use

`threadPoolStoppable().then(data=>data.result.catch())` instead
