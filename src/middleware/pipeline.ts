import { ProxyAbleHttpsAgent } from '../utils/ProxyAbleHttpsAgent'
import { Context } from '../Context'
import { MiddlewareFunc } from '../VProxy'
import { request, ClientRequest, RequestOptions } from 'http'
import url from 'url'
import http from 'http'
import https from 'https'
import { debug } from 'console'

/**
 * pipeline 直接透传网络请求,使用pipe进行透传
 */

export class HTTPTransferProxy {
    opt: PipelineOptions
    httpAgent: http.Agent
    httpsAgent: ProxyAbleHttpsAgent
    constructor(opt: PipelineOptions) {
        this.opt = opt
        this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: opt.maxHttpSockets })
        this.httpsAgent = new ProxyAbleHttpsAgent({ keepAlive: true, maxSockets: opt.maxHttpsSockets })
    }
    async getRequestOptions(ctx: Context): Promise<RequestOptions | undefined> {
        const host = ctx.req.headers.host
        //非法域名与ip格式过滤
        if (host && !host.includes('.')) {
            ctx.abortWithStatus(404)
            return
        }
        // 重建url
        const reqURL = url.parse(ctx.req.url || '')
        const rawURL = `${ctx.protocol}://${host}${reqURL.path}${reqURL.hash || ''}`
        const parsedRawUrl = url.parse(rawURL)
        // 设置代理auth
        const proxy = this.opt.proxy ? await this.opt.proxy() : undefined
        const parsedProxy = proxy ? url.parse(proxy) : undefined
        const headers = this.getRawHeaders(ctx.req.rawHeaders)
        if (parsedProxy && parsedProxy.auth) {
            const auth = Buffer.from(parsedProxy.auth).toString('base64')
            headers['Proxy-Authorization'] = 'Basic ' + auth
            this.httpsAgent.setProxy(proxy)
        }

        const rPath = `${parsedRawUrl.path}${parsedRawUrl.hash || ''}`
        const rawHost = parsedRawUrl.hostname
        return {
            host: rawHost,
            port: parsedProxy
                ? parsedProxy.port!
                : parsedRawUrl
                ? parsedRawUrl.port
                : ctx.protocol === 'https'
                ? 443
                : 80,
            path: rPath,
            method: ctx.req.method,
            headers,
            agent: ctx.protocol === 'https' ? this.httpsAgent : this.httpAgent,
        }
    }
    getRawHeaders(rawHeaders: string[]) {
        const objHeaders = {} as { [k: string]: string }
        for (let n = 0; n < rawHeaders.length; n += 2) {
            objHeaders[rawHeaders[n]] = rawHeaders[n + 1]
        }
        return objHeaders
    }
    /**
     * 实际的上下文，这儿将请求上下文的req动作pipe到httClient
     * @param ctx 请求上下文
     */
    async pipe(ctx: Context) {
        const requestOptions = await this.getRequestOptions(ctx)
        if (!requestOptions) {
            return
        }
        const _request = (res: http.IncomingMessage) => {
            this.networkAccess(res, ctx)
        }
        const httpClient =
            ctx.protocol === 'https' ? https.request(requestOptions, _request) : http.request(requestOptions, _request)

        httpClient.on('error', (err: Error) => {
            debug(`Request Error:${err.message}, ${ctx.req.headers.host} ${ctx.req.url}`)
            ctx.req.removeAllListeners()
            ctx.req.unpipe()
            httpClient.removeAllListeners()
            httpClient.end()
            ctx.abortWithStatus(503)
        })
        httpClient.setTimeout(this.opt.timeOut)
        ctx.req.pipe(httpClient)
    }
    /**
     * 进行实际的网络请求，并pipe到上下文的resp内
     * @param res httpClient 获取的实际响应
     * @param ctx 请求上下文
     */
    networkAccess(res: http.IncomingMessage, ctx: Context) {
        debug(ctx.req.method, `${ctx.protocol}://${ctx.req.headers.host}${ctx.req.url}`)
        res.on('error', (err: Error) => {
            debug('NetworkAccess error', err.message)
            res.removeAllListeners()
            res.destroy(err)
        })
        const objHeaders = this.getRawHeaders(res.rawHeaders)
        ctx.resp.writeHead(res.statusCode || 503, objHeaders)
        res.pipe(ctx.resp)
    }
}

export interface PipelineOptions {
    proxy?: () => Promise<string>
    maxHttpSockets: number
    maxHttpsSockets: number
    timeOut: number
}

export function getPipeline(opt: PipelineOptions): MiddlewareFunc {
    const httpTransfer = new HTTPTransferProxy(opt)
    return async (ctx: Context) => {
        await httpTransfer.pipe(ctx)
        // ctx.abort()
    }
}
