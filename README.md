Auto-configured thread pool for worker_threads, provides both thread and pool function, has thread-safe storage

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

4. has thread-safe storage, can pass javascript Object

## What's new

```
{
    2.0.0: add thread-safe storage
    1.6.8: add console.warn/error, unify methods, fix bugs
    1.6.0: add stoppable thread single, pool, add test case
    1.4.0: support async function
}
```

## Past

<details>
<summary>Past updates</summary>
  <pre>  
{
    1.3.3: env is auto shared
    1.3.0: Add shareEnv option
    1.2.1: Promise.all(threadPool(......)) is now viable
}
  </pre>
</details>

## Notice

- better initialize Pool only once and Store it in a global variable

- some libraries are unable to support `worker_threads`, like `bcrypt`

- process.env is thread unsafe, use with caution.

- cancelling every thread after the execution of `threadPoolStoppable` is no different from `threadSingle`, and maybe slower

- thread-safe storage is very expensive

## API

### Pool(options)

```
{
    threads = if No. of cpu < 3, then 2, else (cpu No. * 2 - 2)
    importGlobal : import / require statement for every threads
    waitMs: Main Thread Promise Checker, check if the pool is open
}
```

---

### async threadSingle(func, ...param)

`func` : toStringable / cloneable function, param : parameters of `func`

single thread runner, very expensive, auto closed.

---

### async threadSingleStoppable(func, ...param)

return `{cancel:Function, result:Promise}`

---

### async threadPool(func, ...param)

`func` : toStringable / cloneable function, param : parameters of `func`

use already initialized threads, expensive at the beginning but much faster than `threadSingle` for larger task

---

### async threadPoolStoppable(func, ...param)

return `Promise<{cancel:Function, result:Promise}>`

`threadPoolStoppable().catch()` will not catch the error, use

`threadPoolStoppable().then(data=>data.result.catch())` instead

---

## Inner API

#### inner api is the function you can use within `func` for functions above, even you didn't define

i.e.

```js
threadSingle(() => timeout(2)).then(() => {}); // wait for 2 seconds
```

---

### async \_lock()

get lock from the pool, will wait if parent is locked

---

### async \_unlock()

unlock from the pool; better call `_lock()` beforehand

---

### async \_waitComplete(callback)

wait for the return of the event queue (will wait when main thread worker's event queue is busy)

---

### async \_autoLocker(callback)

acquire the lock, call `_waitComplete`, release the lock

---

### async \_storage(callback = (store = {}) => {})

synced storage, can communicate between different threads, can be used by both `single` and `pool`, any change on the `store` will be reflected on the original `pool.storage`

i.e.

```js
pool.storage.p = 0;
pool.threadSingle(() => storage(item => item.p++)).then(() => console.log(pool.storage));
```
