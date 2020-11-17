import { FakeHttpsServer } from './FakeHttpsServer'
import {Context} from  "./context"
import { ICAStore } from './ca'
import http from 'http'
import https from 'https'
import net from 'net'
import url from 'url'
import { EventEmitter } from 'events'



function compose (middleware:Function[]) {
    if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
    for (const fn of middleware) {
      if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
    }
  
    /**
     * @param {Object} context
     * @return {Promise}
     * @api public
     */
  
    return function (context:Context, next:Function) {
      // last called middleware #
      let index = -1
      return dispatch(0)
      function dispatch (i:number):any {
        if (i <= index) return Promise.reject(new Error('next() called multiple times'))
        index = i
        let fn = middleware[i]
        if (i === middleware.length) fn = next
        if (!fn) return Promise.resolve()
        try {
          return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
        } catch (err) {
          return Promise.reject(err)
        }
      }
    }
  }

interface MitmProxyOptions {
    /**
     * 假的https服务器的端口
     */
    fakeServerPort: number
    /**
     * http代理的端口
     */
    httpTunnelPort: number
    /**
     * 实现证书存储接口的接口，默认是使用文件放置到$HOME/.soveietironfist 目录下
     */
    caStore?: ICAStore
}
export interface MitmProxy extends EventEmitter {
    /**
     * 使用中间件，使用上类似于koa的中间件，也是一个洋葱模型
     * @param middleware 中间件函数
     */
    // use(middleware: (cxt:Context) => void): this
}

export class MitmProxy extends EventEmitter {
    private httpTunnel: http.Server
    private fakeHttpsServer: FakeHttpsServer
    private middleware :Array<Function>= []
    constructor(httpTunnel: http.Server, fakeHttpsServer: FakeHttpsServer) {
        super()
        this.httpTunnel = httpTunnel
        this.fakeHttpsServer = fakeHttpsServer
        this.httpTunnel.on('connect', (req: http.IncomingMessage, cltSocket: net.Socket, head: Buffer) => {
            const srvUrl = url.parse(`https://${req.url}`)
            console.debug(`CONNECT ${srvUrl.hostname}:${srvUrl.port}`)
            const srvSocket = net.connect(fakeHttpsServer.port, '127.0.0.1', () => {
                cltSocket.write(
                    'HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: SOVITE-MITM-proxy\r\n' + '\r\n',
                )
                srvSocket.write(head)
                srvSocket.pipe(cltSocket)
                cltSocket.pipe(srvSocket)
                const clearup = () => {
                    cltSocket.unpipe()
                    srvSocket.unpipe()
                    cltSocket.removeAllListeners()
                    cltSocket.destroy()
                    srvSocket.removeAllListeners()
                    srvSocket.destroy()
                }
                cltSocket.on('error', (error) => {
                    clearup()
                })
                srvSocket.on('error', (error) => {
                    clearup()
                })
            })
        })
        this.httpTunnel.on('request', (req: http.IncomingMessage, resp: http.ServerResponse) => {
            this._request(req, resp, 'http')
        })
        this.fakeHttpsServer.on(
            'request',
            (req: http.IncomingMessage, resp: http.ServerResponse, protocol: 'https') => {
                this._request(req, resp, protocol)
            },
        )
    }

    static async create(options: MitmProxyOptions) {
        const fakeHttpsServer = await FakeHttpsServer.create(options.fakeServerPort, options.caStore)
        const httpTunnel = new http.Server()
        return new MitmProxy(httpTunnel, fakeHttpsServer)
    }

    private callback(){
        const fn = compose(this.middleware)

    }

    private _request(req: http.IncomingMessage, resp: http.ServerResponse, protocol: 'http' | 'https') {
        // let urlObject = url.parse(req.url!)
        // let options = {
        //     protocol: protocol + ':',
        //     hostname: req.headers.host!.split(':')[0],
        //     method: req.method,
        //     port: req.headers.host!.split(':')[1] || 80,
        //     path: urlObject.path,
        //     headers: req.headers,
        // }

        // resp.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' })
        // resp.write(`<html><body>我是伪造的: ${options.protocol}//${options.hostname} 站点</body></html>`)
        // resp.end()
    }

    async start() {
        return new Promise<void>((resv) => {
            this.httpTunnel.listen(8080, () => {
                resv()
            })
        })
    }
    public use(fn:Function){
        this.middleware.push(fn)

    }
}

; (async () => {
    const a = await MitmProxy.create({
        fakeServerPort: 12345,
        httpTunnelPort: 8080,
    })
    await a.start()
})()
