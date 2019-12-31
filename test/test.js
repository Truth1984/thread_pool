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

for (let i = 0; i < 10; i++) pool.threadSingle(data => data++, i);

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
      if (res !== undefined) Promise.reject("pool stoppable not returning undefined as result");
    });
  });

for (let i = 0; i < 10; i++) pool.threadPoolStoppable(() => 10).then(data => data.cancel());
