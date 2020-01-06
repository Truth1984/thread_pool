const { Worker, isMainThread, SHARE_ENV } = require("worker_threads");
const os = require("os");

let functionSlicer = (func = () => {}) => {
  let whole = func.toString();
  return whole.slice(whole.indexOf("{") + 1, whole.lastIndexOf("}"));
};

/**
 * worker receives type :
 *
 * [{type:"eval", func, param},{type:"getLock", lock},{type:"getStorage",storage}, {type:"complete", id}]
 *
 * worker can perform/post type:
 *
 * ["msg","msg-warn","msg-error","result","reject","getLock","unlock","getStorage","setStorage", "complete"]
 */
let workerLogic = exitAfter => {
  const { parentPort } = require("worker_threads");

  let post = (data, type = "msg") => parentPort.postMessage({ data, type });
  let sleep = seconds => new Promise(resolve => setTimeout(() => resolve(), seconds * 1000));
  let _unlocked = false;
  let _completeid = 0;
  let _complete = {};
  let _temp_storage_ = {};

  let _lock = async () => {
    while (!_unlocked) await sleep(0.1).then(() => post("", "getLock"));
  };

  let _unlock = async () => {
    post("", "unlock");
    _unlocked = false;
  };

  //wait for worker's event queue to reach that point
  let _waitComplete = async callback => {
    let id = _completeid++;
    return Promise.resolve(callback()).then(async data => {
      post(id, "complete");
      while (!_complete[id]) await sleep(0.1);
      delete _complete[id];
      return data;
    });
  };

  let _autoLocker = async callback => {
    await _lock();
    await _waitComplete(callback);
    await _unlock();
  };

  let storage = async callback => {
    await _lock();
    await _waitComplete(() => post("", "getStorage"));
    await callback(_temp_storage_);
    await _waitComplete(() => post(_temp_storage_, "setStorage"));
    await _unlock();
    return _temp_storage_;
  };

  console = {
    log: (...data) => post(data),
    warn: (...data) => post(data, "msg-warn"),
    error: (...data) => post(data, "msg-error")
  };

  let evaluate = item => {
    let func = eval(item.func);
    let result = Promise.resolve(func(...item.param));
    result
      .then(data => post(data, "result"))
      .catch(error => post(error, "reject"))
      .then(() => (exitAfter ? process.exit() : ""));
  };

  parentPort.on("message", message => {
    if (message.type == "eval") return evaluate(message);
    if (message.type == "getLock") return (_unlocked = message.lock);
    if (message.type == "getStorage") return (_temp_storage_ = message.storage);
    if (message.type == "complete") return (_complete[message.id] = true);
  });
};

module.exports = class Pool {
  /**
   *
   * @param {{threads:Number, importGlobal:string, waitMs:Number}} config threads : CPUNo. < 3 ? 2 : (CPUNo. * 2 - 2)
   *
   * importGlobal : <require / import> statement, for thread pool environment, reduce overhead
   *
   * waitMs : the frequency of threadPool checking if thread is avaliable, default: 100
   */
  constructor(config = {}) {
    let defaultConfig = {
      threads: os.cpus().length < 3 ? 2 : os.cpus().length * 2 - 2,
      importGlobal: ``,
      waitMs: 100
    };
    config = Object.assign(defaultConfig, config);

    this.entry = {};
    this.storage = {};

    this.entry.threadNo = config.threads;
    this.entry.importGlobal = config.importGlobal;
    this.entry.waitMs = config.waitMs;

    this.entry._lock = false;
    this.entry._threaduid = 1;
    this.entry._threadCancelable = {}; // {uid : threadid} threadid corresponding to _threadpPools
    this.entry._threadPools = {};
    this.entry._threadAvailableID = Array(this.entry.threadNo)
      .fill()
      .map((i, index) => index);

    this.entry.workerMaker = (exitAfter = true) =>
      new Worker(this.entry.importGlobal + `\nlet exitAfter = ${exitAfter};\n` + functionSlicer(workerLogic), {
        eval: true,
        env: SHARE_ENV
      });

    this.entry.getLock = worker => {
      let lock = this.entry._lock == false ? (this.entry._lock = true) : false;
      worker.postMessage({ lock, type: "getLock" });
    };
    this.entry.getStorage = worker => {
      worker.postMessage({ storage: this.storage, type: "getStorage" });
    };
    this.entry.setStorage = pairs => (this.storage = pairs);
    this.entry.setComplete = (worker, id) => worker.postMessage({ type: "complete", id });
    this.entry.unlock = () => (this.entry._lock = false);

    this.entry.setListener = (worker, resolve, reject) => {
      worker.removeAllListeners();
      worker.on("message", message => {
        if (message.type == "msg") return console.log(...message.data);
        if (message.type == "result") return resolve(message.data);
        if (message.type == "reject") return reject(message.data);
        if (message.type == "msg-warn") return console.warn(...message.data);
        if (message.type == "msg-error") return console.error(...message.data);
        if (message.type == "getLock") return this.entry.getLock(worker);
        if (message.type == "unlock") return this.entry.unlock();
        if (message.type == "getStorage") return this.entry.getStorage(worker);
        if (message.type == "setStorage") return this.entry.setStorage(message.data);
        if (message.type == "complete") return this.entry.setComplete(worker, message.data);
      });
      worker.once("error", error => reject(error));
      worker.once("exit", () => resolve());
    };

    this.entry.publisher = (data, uid) => {
      let threadid = this.entry._threadCancelable[uid];
      this.entry._threadAvailableID.push(threadid);
      delete this.entry._threadCancelable[uid];
      return data;
    };

    this.entry.terminatePoolProtocol = uid => {
      let threadid = this.entry._threadCancelable[uid];
      let thread = this.entry._threadPools[threadid];
      if (threadid && thread && thread.terminate) {
        thread.terminate();
        delete this.entry._threadPools[threadid];
        delete this.entry._threadCancelable[uid];
      }
    };
  }

  /**
   *
   * @return {{cancel:Function, result:Promise}}
   */
  threadSingleStoppable(func, ...param) {
    if (isMainThread) {
      let worker = this.entry.workerMaker();
      worker.postMessage({ func: func.toString(), param, type: "eval" });

      return {
        cancel: () => worker.terminate(),
        result: new Promise((resolve, reject) => this.entry.setListener(worker, resolve, reject))
      };
    }
    return {
      cancel: () => {},
      result: Promise.reject("This is not in the main thread")
    };
  }

  /**
   * @param func {Function}
   */
  async threadSingle(func, ...param) {
    return this.threadSingleStoppable(func, ...param).result;
  }

  async threadPool(func, ...param) {
    return this.threadPoolStoppable(func, ...param)
      .then(data => data.result)
      .catch(e => Promise.reject(e));
  }

  /**
   *
   * @param {Number} uid if(uid > 0)  delete corresponding uid, the thread won't be stopped if uid is already resolved/rejected
   *
   * if(uid == 0) ? delete all threads from thread pool
   *
   * if(uid < 0) ? Nothing;
   */
  async _threadPoolStop(uid = 0) {
    if (uid > 0) this.entry.terminatePoolProtocol(uid);
    if (uid == 0) {
      Object.keys(this.entry._threadCancelable).map(uid => this.entry.terminatePoolProtocol(uid));
      Object.values(this.entry._threadPools).map(thread => thread.terminate());
      this.entry._threadPools = {};
      this.entry._threadAvailableID = Array(this.entry.threadNo)
        .fill()
        .map((i, index) => index);
    }
  }

  /**
   * @return {Promise<{result:Promise,uid:Number, cancel:Function}>}
   */
  async threadPoolStoppable(func, ...param) {
    if (this.entry._threadAvailableID.length <= 0) {
      await new Promise(resolve => setTimeout(() => resolve(), this.entry.waitMs));
      return this.threadPoolStoppable(func, ...param);
    }

    if (isMainThread) {
      let threadid = this.entry._threadAvailableID.pop();
      let uid = this.entry._threaduid++;
      this.entry._threadCancelable[uid] = threadid;

      if (!this.entry._threadPools[threadid]) this.entry._threadPools[threadid] = this.entry.workerMaker(false);
      this.entry._threadPools[threadid].postMessage({ func: func.toString(), param, type: "eval" });

      return {
        uid,
        cancel: () => this.entry.terminatePoolProtocol(uid),
        result: new Promise((resolve, reject) =>
          this.entry.setListener(this.entry._threadPools[threadid], resolve, reject)
        )
          .then(data => this.entry.publisher(data, uid))
          .catch(error => Promise.reject(this.entry.publisher(error, uid)))
      };
    }
    return {
      uid: -1,
      cancel: () => {},
      result: Promise.reject("This is not in the main thread")
    };
  }
};
