const { Worker, isMainThread } = require("worker_threads");
const os = require("os");

module.exports = class Pool {
  /**
   *
   * @param {{threads:Number, importGlobal:string, waitMs:Number}} config threads : CPUNo. < 3 ? 2 : CPUNo. * 2 - 2
   *
   * importGlobal : statement, for thread pool environment, reduce overhead
   *
   * waitMs : the frequency of threadPool checking if thread is avaliable, default: 100
   */
  constructor(config = {}) {
    this.threadNo = config.threads ? config.threads : os.cpus().length < 3 ? 2 : os.cpus().length * 2 - 2;
    this.importGlobal = config.importGlobal ? config.importGlobal : ``;
    this.waitMs = config.waitMs ? config.waitMs : 100;

    this._threadPools = {};
    this._threadAvailableID = Array(this.threadNo)
      .fill()
      .map((i, index) => index);
  }

  /**
   * @param func {Function}
   */
  async threadSingle(func, ...param) {
    if (isMainThread) {
      return new Promise((resolve, reject) => {
        let worker = new Worker(
          ` const {  parentPort, workerData } = require("worker_threads");
            ${this.importGlobal} 

            let post = (data, type = "msg") => parentPort.postMessage({data,type});
            console.log = (...data) => post(data);
        
            let result = (${func.toString()})(...workerData.parameter); 
            post(result,"result");
            process.exit();`,
          { eval: true, workerData: { parameter: param } }
        );

        worker.once("message", message => {
          if (message.type == "msg") console.log(...message.data);
          else resolve(message.data);
        });
        worker.once("error", error => reject(error));
        worker.once("exit", () => resolve());
      });
    } else {
      Promise.reject("This is not main thread");
    }
  }

  async _threadAlive(id, func, ...param) {
    if (isMainThread) {
      if (!this._threadPools[id]) {
        this._threadPools[id] = new Worker(
          ` const { parentPort, workerData } = require("worker_threads");
            ${this.importGlobal} 
        
            let post = (data, type = "msg") => parentPort.postMessage({data,type});
            console.log = (...data) => post(data);
        
            parentPort.on('message', item => {
              let func = eval(item.func);
              let result = func(...item.param); 
              post(result,"result");
            });
            `,
          { eval: true }
        );
      }
      this._threadPools[id].postMessage({ func: func.toString(), param });

      return new Promise((resolve, reject) => {
        this._threadPools[id].removeAllListeners();
        this._threadPools[id].once("message", message => {
          if (message.type == "msg") console.log(...message.data);
          else resolve(message.data);
        });
        this._threadPools[id].once("error", error => reject(error));
        this._threadPools[id].once("exit", () => resolve());
      });
    }
    return Promise.reject("This is not main thread");
  }

  async threadPool(func, ...param) {
    if (this._threadAvailableID.length > 0) {
      let threadid = this._threadAvailableID.pop();
      return this._threadAlive(threadid, func, ...param)
        .then(data => {
          this._threadAvailableID.push(threadid);
          return data;
        })
        .catch(e => {
          this._threadAvailableID.push(threadid);
          return Promise.reject(e);
        });
    } else {
      await new Promise(resolve => setTimeout(() => resolve(), this.waitMs));
      return this.threadPool(func, ...param);
    }
  }
};
