const Pool = require("../index.js");

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
    if (Object.keys(pool2.entry._threadPools).length != 1)
      return Promise.reject("thread pool is not lazy initializing");
  })
  .then(() => pool2.threadPoolStoppable(() => 12 + 13))
  .then(() =>
    pool2.threadPoolStoppable(() => {
      if (Object.keys(pool2.entry._threadPools).length != 1)
        return Promise.reject("thread pool is not lazy initializing !!!");
    })
  )
  .then(() => pool2._threadPoolStop())
  .then(() => console.log("pool test finished, all test passed, yay"));
