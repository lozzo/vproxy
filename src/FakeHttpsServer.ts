import https from 'https'
import tls from 'tls'
import { CAManger, ICAStore } from './ca'
import http from 'http'
import { EventEmitter } from 'events'

export interface FakeHttpsServer extends EventEmitter {
    on(event: 'request', callback: (req: http.IncomingMessage, resp: http.ServerResponse,protocol:'https') => void): this
}

export class FakeHttpsServer extends EventEmitter {
    private caManger: CAManger
    private server: https.Server
    public port: number
    constructor(caManger: CAManger, server: https.Server) {
        super()
        this.caManger = caManger
        this.server = server
        this.port = (server.address() as any).port
        this.server.on('request', (req: http.IncomingMessage, resp: http.ServerResponse) => {
            this.emit('request', req, resp,'https') 
        })
    }

    static async create(port: number, store?: ICAStore) {
        return new Promise<FakeHttpsServer>((resv) => {
            const caManger = new CAManger(store)
            const ca = caManger.RootCACert
            caManger.installRootCA()
            const httpsServer = new https.Server({
                cert: ca.cert,
                key: ca.key,
                SNICallback: (hostname, callback) => {
                    const _ca = caManger.getCAByDomain(hostname)
                    callback(null, tls.createSecureContext(_ca))
                },
            })
            httpsServer.listen(port, () => {
                resv(new FakeHttpsServer(caManger, httpsServer))
            })
        })
    }
}
