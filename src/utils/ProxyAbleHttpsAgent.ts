import https from "https"
import tls from "tls"
import net from "net"


export class ProxyAbleHttpsAgent extends https.Agent {
    private static _keybuf = Buffer.from('\r\n\r\n');
    private static _okcode = Buffer.from('200');

    private _proxy?: { host: string, port: number }

    constructor(options?: https.AgentOptions) {
        super(options);
    }
    //todo opts 类型
    public createConnection(opts: any, callback: (err?: Error | null, stream?: net.Socket | null) => void) {
        if (!this._proxy) {
            const sock = tls.connect({
                host: opts.host,
                port: opts.port,
                rejectUnauthorized: false
            });
            callback(null, sock)
            return
        }

        let socket = net.connect(this._proxy)
        let buf = Buffer.allocUnsafeSlow(256)
        let buffersLength = 0
        const ondata = (b: Buffer) => {
            b.copy(buf, buffersLength, 0, b.length)
            buffersLength += b.length
            if (!buf.includes(ProxyAbleHttpsAgent._keybuf)) {
                socket.readable ? read() : socket.once('data', ondata)
                return
            }
            const okCode = buf.slice(0., 16).includes(ProxyAbleHttpsAgent._okcode, 0)
            if (okCode) {
                socket.removeAllListeners()
                socket = tls.connect({
                    host: opts.servername,
                    socket: socket,
                    rejectUnauthorized: false
                })
                callback(null, socket)
            } else {
                cleanup()
                callback(new Error('porxy connect error'), undefined)
            }
        }


        const read = () => {
            const b = socket.read()
        }

        const cleanup = () => {

        }


    }
}