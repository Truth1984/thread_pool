const { Worker, isMainThread, SHARE_ENV } = require("worker_threads");
const os = require("os");

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

    this.entry.threadNo = config.threads;
    this.entry.importGlobal = config.importGlobal;
    this.entry.waitMs = config.waitMs;

    this.entry._threadPools = {};
    this.entry._threadAvailableID = Array(this.entry.threadNo)
      .fill()
      .map((i, index) => index);

    this.entry.workerMaker = (exit = true) =>
      new Worker(
        ` const {  parentPort } = require("worker_threads");
        ${this.entry.importGlobal} 
        let post = (data, type = "msg") => parentPort.postMessage({ data, type }); 
        console = {
          log: (...data) => post(data),
          warn: (...data) => post(data, "msg-warn"),
          error: (...data) => post(data, "msg-error")
        };

        let evaluate = item => {
          let func = eval(item.func);
          let result = func(...item.param); 
          if (result instanceof Promise){
            result.then(data => post(data, "result")).catch(error => post(error, "reject")).then(()=>process.exit())
          } else {
            post(result, "result");
            ${exit ? `process.exit();` : ``}
          }
        };

        parentPort.once("message", message => {
          if (message.type == "eval") return evaluate(message);
        });
        `,
        { eval: true, env: SHARE_ENV }
      );

    this.entry.setListener = (worker, resolve, reject) => {
      worker.removeAllListeners();
      worker.on("message", message => {
        if (message.type == "msg") return console.log(...message.data);
        if (message.type == "result") return resolve(message.data);
        if (message.type == "reject") return reject(message.data);
        if (message.type == "msg-warn") return console.warn(...message.data);
        if (message.type == "msg-error") return console.error(...message.data);
      });
      worker.once("error", error => reject(error));
      worker.once("exit", () => resolve());
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
   * @return {Promise<{result:Promise, cancel:Function}>}
   */
  async threadPoolStoppable(func, ...param) {
    if (this.entry._threadAvailableID.length <= 0) {
      await new Promise(resolve => setTimeout(() => resolve(), this.entry.waitMs));
      return this.threadPoolStoppable(func, ...param);
    }
    let threadid = this.entry._threadAvailableID.pop();
    if (isMainThread) {
      if (!this.entry._threadPools[threadid]) this.entry._threadPools[threadid] = this.entry.workerMaker(false);
      this.entry._threadPools[threadid].postMessage({ func: func.toString(), param, type: "eval" });

      let publisher = data => {
        this.entry._threadAvailableID.push(threadid);
        return data;
      };

      return {
        cancel: () => {
          this.entry._threadPools[threadid].terminate();
          delete this.entry._threadPools[threadid];
        },
        result: new Promise((resolve, reject) =>
          this.entry.setListener(this.entry._threadPools[threadid], resolve, reject)
        )
          .then(data => publisher(data))
          .catch(error => Promise.reject(publisher(error)))
      };
    }
    return {
      cancel: () => {},
      result: Promise.reject("This is not in the main thread")
    };
  }
};
