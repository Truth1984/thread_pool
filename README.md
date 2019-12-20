Auto-configured pool for worker threads, provides both thread and pool

## Usage

#### Use `--experimental-worker` flag while running the code.

```js
const Pool = require("thread_pool");

let ezpool = new Pool();
let pool = new Pool({
  threads: 2,
  importGlobal: `const os = require('os');`,
  waitMs: 1000
});

for (let i = 0; i < 10; i++) pool.threadPool(index => console.log(os.cpus().length + index), i);
```

## features

1. Auto configured

2. Lazy initialze threads in thread pool

3. can use `console.log` inside thread function

## API

### Pool(options)

```
{
    threads = if No. of cpu < 3, then 2, else (cpu No. * 2 - 2)
    importGlobal : import / require statement for every threads
    waitMs: Main Thread Promise Checker, check if the pool is open
}
```

##### notice: better initialize Pool only once and Store it in a global variable

### async threadSingle(func, ...param)

single threads runner, very expensive, auto closed.

### async threadPool(func, ...param)

use already initialized threads, expensive at the beginning but much faster than `threadSingle` for larger task
