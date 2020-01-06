const Pool = require("../index.js");

let pool = new Pool({ importGlobal: `const os = require('os')`, threads: 4 });
let types = (item, type) => {
  if (!item instanceof type) throw new Error(item + " is not type " + type);
};

let single = pool.threadSingle(() => {});
types(single, Promise);

// single importGlobal test
pool.threadSingle(() => os.cpus().length);

//async test
pool.threadSingle(async () => 1);
pool.threadPoolStoppable(async () => 1).then(data => data.cancel());

//stress
for (let i = 0; i < 100; i++) pool.threadSingle(data => data++, i);

// single stoppable test
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
singleStoppable.result.catch(e => console.log(e));

// process.env + promise.all test
let arrSingle = [];
process.env.arrSingleCounter = "";
for (let i = 0; i < 5; i++)
  arrSingle.push(
    pool.threadSingle(() => {
      process.env.arrSingleCounter += "x";
    })
  );
Promise.all(arrSingle).then(() => {
  if (process.env.arrSingleCounter != "xxxxx")
    return Promise.reject("arrSingleCounter error:" + process.env.arrSingleCounter);
});

//catcher
pool.threadSingle(() => Promise.reject("single catch test")).catch(e => {});
pool.threadSingleStoppable(() => Promise.reject("single stoppable catch test")).result.catch(e => {});
// pool.threadPool(() => Promise.reject("pool catch test")).catch(e => {});
pool
  .threadPoolStoppable(() => Promise.reject("pools catch test"))
  .then(data => {
    data.result.catch(e => {}).then(() => data.cancel());
  });

//pool stoppable test
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
  });

for (let i = 0; i < 10; i++) pool.threadPoolStoppable(() => 10).then(data => data.cancel());

pool.threadSingle(() => console.log("console-log"));
pool.threadSingle(() => console.warn("console-warn"));
pool.threadSingle(() => console.error("console-error"));

//thread safe storage test
let arrSingle2 = [];
pool.storage.item = 0;
for (let i = 0; i < 20; i++) arrSingle2.push(pool.threadSingle(() => storage(store => store.item++)));
Promise.all(arrSingle2).then(() => {
  if (pool.storage.item != 20) return Promise.reject("async storage is not thread safe");
});

let arrPool = [];
pool.storage.bag = 0;
for (let i = 0; i < 20; i++) arrPool.push(pool.threadPoolStoppable(() => storage(store => store.bag++)));
let resultPool = Array.from(arrPool).map(val => val.then(d => d.result));
Promise.all(resultPool)
  .then(() => {
    if (pool.storage.bag != 20) return Promise.reject("async storage is not thread safe");
  })
  .then(() => pool._threadPoolStop());

let pool2 = new Pool({ importGlobal: `const os = require('os')`, threads: 4 });
let arrPool2 = [];
for (let i = 0; i < 20; i++) arrPool2.push(pool2.threadPoolStoppable(() => 100));
let resultPool2 = Array.from(arrPool2).map(val => val.then(d => d.result));
let cancelPool2 = Array.from(arrPool2).map(val => val.then(d => d.cancel));
Promise.all(resultPool2)
  .then(() => cancelPool2.map(cp => cp.then(c => c())))
  .then(() => {
    if (Object.keys(pool2.entry._threadPools).length != 4)
      return Promise.reject("finshed threads should not be canceled");

    if (Object.keys(pool2.entry._threadAvailableID).length != 4)
      return Promise.reject("thread avaliable id not matched");
  })
  .then(() => pool2._threadPoolStop())
  .then(() => {
    if (Object.keys(pool2.entry._threadPools).length != 0) return Promise.reject("thread pool should be empty by now");
    if (Object.keys(pool2.entry._threadAvailableID).length != 4)
      return Promise.reject("thread avaliable id not matched v2");
  })
  .then(() => pool2.threadPoolStoppable(() => 12 + 13))
  .then(data => data.result)
  .then(data => {
    if (data != 25) return Promise.reject("thread pool is not initializing properly");
    if (Object.keys(pool2.entry._threadPools).length != 1) return Promise.reject("thread pool is not lazy initialized");
  })
  .then(() => pool2._threadPoolStop());
