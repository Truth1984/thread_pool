const Pool = require("../index.js");
const { TaskLanguage } = require("tasklanguage");

let task = new TaskLanguage(false);

let pool = new Pool({ importGlobal: `const os = require('os')`, threads: 4 });
let types = (item, type) => {
  if (!item instanceof type) throw new Error(item + " is not type " + type);
};

task.ADDCommand(
  task.MARK("initial check"),
  () =>
    types(
      pool.threadSingle(() => {}),
      Promise
    ),
  task.MARK("single importGlobal test"),
  () => pool.threadSingle(() => os.cpus().length),
  task.MARK("async test"),
  () => pool.threadSingle(async () => 1),
  task.MARK("stress test"),
  () => Promise.all(Array(100).fill(pool.threadSingle(data => data++, 10))),
  task.MARK("single stoppable test"),
  () => {
    let singleStoppable = pool.threadSingleStoppable(() => {
      let timeout = seconds => new Promise(resolve => setTimeout(() => resolve(), seconds * 1000));
      return timeout(5).then(() => {
        console.log("Still running in single stoppable ???");
        return Promise.reject("timeout from singleStoppable");
      });
    });
    types(singleStoppable, Object);
    types(singleStoppable.cancel, Function);
    types(singleStoppable, Promise);
    singleStoppable.cancel();
  },
  task.MARK("process.env + promise.all test"),
  () => {
    let arrSingle = [];
    process.env.arrSingleCounter = "";
    for (let i = 0; i < 5; i++)
      arrSingle.push(
        pool.threadSingle(() => {
          process.env.arrSingleCounter += "x";
        })
      );
    return Promise.all(arrSingle).then(() => {
      if (process.env.arrSingleCounter != "xxxxx")
        return Promise.reject("arrSingleCounter error:" + process.env.arrSingleCounter);
    });
  },
  task.MARK("catcher"),
  () => pool.threadSingle(() => Promise.reject("single catch test")).catch(e => {}),
  () => pool.threadSingleStoppable(() => Promise.reject("single stoppable catch test")).result.catch(e => {}),
  () => pool.threadPool(() => Promise.reject("pool catch test")).catch(e => {}),
  () => pool.threadPoolStoppable(() => Promise.reject("pools catch test")).then(data => data.result.catch(e => {})),
  task.MARK("pool stoppable test"),
  () =>
    pool
      .threadPoolStoppable(() => {
        let timeout = seconds => new Promise(resolve => setTimeout(() => resolve(), seconds * 1000));
        return timeout(3).then(() => Promise.reject("pool stoppable is still running after cancel ???"));
      })
      .then(data => {
        data.cancel();
        data.result.then(res => {
          if (res !== undefined) return Promise.reject("pool stoppable not returning undefined as result");
        });
      }),
  task.MARK("thread safe storage test"),
  () => {
    let arr = [];
    pool.storage.item = 0;
    for (let i = 0; i < 20; i++) arr.push(pool.threadSingle(() => assist.storage(store => store.item++)));
    return Promise.all(arr).then(() => {
      if (pool.storage.item != 20) return Promise.reject("async storage is not thread safe");
    });
  },
  () => {
    let arrPool = [];
    pool.storage.bag = 0;
    for (let i = 0; i < 20; i++) arrPool.push(pool.threadPoolStoppable(() => assist.storage(store => store.bag++)));
    let resultPool = Array.from(arrPool).map(val => val.then(d => d.result));
    return Promise.all(resultPool)
      .then(() => {
        if (pool.storage.bag != 20) return Promise.reject("async storage is not thread safe");
      })
      .then(() => pool._threadPoolStop());
  },
  () => {
    let arrPool = [];
    for (let i = 0; i < 20; i++) arrPool.push(pool.threadPoolStoppable(() => 100));
    let resultPool2 = Array.from(arrPool).map(val => val.then(d => d.result));
    let cancelPool2 = Array.from(arrPool).map(val => val.then(d => d.cancel));
    return Promise.all(resultPool2)
      .then(() => cancelPool2.map(cp => cp.then(c => c())))
      .then(() => {
        if (Object.keys(pool.entry._threadPools).length != 4)
          return Promise.reject("finshed threads should not be canceled");

        if (Object.keys(pool.entry._threadAvailableID).length != 4)
          return Promise.reject("thread avaliable id not matched");
      })
      .then(() => pool._threadPoolStop())
      .then(() => {
        if (Object.keys(pool.entry._threadPools).length != 0)
          return Promise.reject("thread pool should be empty by now");
        if (Object.keys(pool.entry._threadAvailableID).length != 4)
          return Promise.reject("thread avaliable id not matched v2");
      })
      .then(() => pool.threadPoolStoppable(() => 12 + 13))
      .then(data => data.result)
      .then(data => {
        if (data != 25) return Promise.reject("thread pool is not initializing properly");
        if (Object.keys(pool.entry._threadPools).length != 1)
          return Promise.reject("thread pool is not lazy initialized");
      })
      .then(() => pool._threadPoolStop());
  },
  task.MARK("reject unlock test"),
  () => pool.threadPool(() => assist.storage(store => (store.pp.udf = 13))).catch(e => {}),
  () => {
    if (pool.entry._lock) return Promise.reject("thread pool reject is not unlocked");
  },
  task.MARK("lock test"),
  () =>
    pool.threadPool(async () => {
      await assist.waitComplete(() => assist.post("", "getLock"));
      if (!_subProcessing.unlocked) return Promise.reject("thread pool getLock, lock not acquired");
    }),
  () => {
    if (!pool.entry._lock) return Promise.reject("thread pool main lock is not locked");
  },
  () =>
    pool.threadPool(async () => {
      await assist.waitComplete(() => assist.post("", "getLock"));
      if (_subProcessing.unlocked) return Promise.reject("thread pool is not locked, lock acquired again");
    }),
  () => pool.threadPool(() => assist.waitComplete(() => assist.post("", "unlock"))),
  () => {
    if (pool.entry._lock) return Promise.reject("thread pool main lock is still locking");
  },
  () => pool._threadPoolStop()
);

task
  .RUN()
  .then(() => console.log("all tests passed"))
  .catch(e => console.log(e));
