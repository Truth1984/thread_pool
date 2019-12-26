const { Worker, isMainThread, SHARE_ENV } = require("worker_threads");
const os = require("os");

module.exports = class Pool {
  /**
   *
   * @param {{threads:Number, importGlobal:string, waitMs:Number, shareEnv: Boolean}} config threads : CPUNo. < 3 ? 2 : CPUNo. * 2 - 2
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
    this.entry.shareEnv = config.shareEnv;

    this.entry._threadPools = {};
    this.entry._threadAvailableID = Array(this.entry.threadNo)
      .fill()
      .map((i, index) => index);
    this.entry._posterString = `let post = (data, type = "msg") => parentPort.postMessage({ data, type }); 
    console.log = (...data) => post(data);`;

    this.entry.setListener = (worker, resolve, reject) => {
      worker.removeAllListeners();
      worker.on("message", message => {
        if (message.type == "msg") console.log(...message.data);
        else resolve(message.data);
      });
      worker.once("error", error => reject(error));
      worker.once("exit", () => resolve());
    };
  }

  /**
   * @param func {Function}
   */
  async threadSingle(func, ...param) {
    if (isMainThread) {
      let worker = new Worker(
        ` const {  parentPort, workerData } = require("worker_threads");
          ${this.entry.importGlobal} 

          ${this.entry._posterString}
          ${this.entry.shareEnv ? this.entry._env : ""}
      
          let result = (${func.toString()})(...workerData.parameter); 
          post(result,"result");
          process.exit();`,
        { eval: true, workerData: { parameter: param }, env: SHARE_ENV }
      );
      return new Promise((resolve, reject) => this.entry.setListener(worker, resolve, reject));
    }
    return Promise.reject("This is not in the main thread");
  }

  async _threadAlive(id, func, ...param) {
    if (isMainThread) {
      if (!this.entry._threadPools[id]) {
        this.entry._threadPools[id] = new Worker(
          ` const { parentPort, workerData } = require("worker_threads");
            ${this.entry.importGlobal} 
        
            ${this.entry._posterString}
            ${this.entry.shareEnv ? this.entry._env : ""}
        
            parentPort.on('message', item => {
              let func = eval(item.func);
              let result = func(...item.param); 
              post(result, "result");
            });
            `,
          { eval: true, env: SHARE_ENV }
        );
      }
      this.entry._threadPools[id].postMessage({ func: func.toString(), param });

      return new Promise((resolve, reject) => this.entry.setListener(this.entry._threadPools[id], resolve, reject));
    }
    return Promise.reject("This is not in the main thread");
  }

  async threadPool(func, ...param) {
    if (this.entry._threadAvailableID.length <= 0) {
      await new Promise(resolve => setTimeout(() => resolve(), this.entry.waitMs));
      return this.threadPool(func, ...param);
    }

    let threadid = this.entry._threadAvailableID.pop();
    let publisher = data => {
      this.entry._threadAvailableID.push(threadid);
      return data;
    };
    return this._threadAlive(threadid, func, ...param)
      .then(data => publisher(data))
      .catch(e => Promise.reject(publisher(e)));
  }
};
