import forge, { pki } from 'node-forge'
import fs from 'fs'
import os from 'os'
import path from 'path'

interface ICert {
    cert: string
    key: string
}

export interface ICAStore {
    save(domain: string, ca: ICert): void
    get(domain: string): ICert | null
}

class FsCAStore implements ICAStore {
    constructor() {
        const savePath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.soveietironfist')
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath)
        }
    }

    save(domain: string, ca: ICert) {
        const savePath = this.getPath(domain)
        fs.writeFileSync(`${savePath}.crt`, ca.cert)
        fs.writeFileSync(`${savePath}.key`, ca.key)
    }

    get(domain: string): ICert | null {
        const savePath = this.getPath(domain)
        const certPath = `${savePath}.crt`
        const keyPath = `${savePath}.key`
        try {
            return {
                cert: fs.readFileSync(certPath, 'utf-8'),
                key: fs.readFileSync(keyPath, 'utf-8'),
            }
        } catch {
            return null
        }
    }
    // todo 这儿路径公共路径
    getPath(domain: string) {
        return path.join(process.env.HOME || process.env.USERPROFILE || '.', '.soveietironfist', domain)
    }
}

export class CAManger {
    private rootCACert?: pki.Certificate
    private rootCAKey?: pki.rsa.PrivateKey
    store: ICAStore
    private rootCAName: string = 'KGB'
    /**
     *
     * @param store 证书存储介质,默认是文件
     */
    constructor(store?: ICAStore) {
        this.store = store || new FsCAStore()
        const ca = this.store.get(this.rootCAName) || this.genNewRootCA()
        if (ca && ca.key) {
            this.rootCACert = forge.pki.certificateFromPem(ca.cert)
            this.rootCAKey = forge.pki.privateKeyFromPem(ca.key)
        }
    }

    private genNewRootCA() {
        const keys = pki.rsa.generateKeyPair(2049)
        const cert = pki.createCertificate()
        cert.publicKey = keys.publicKey
        cert.serialNumber = new Date().getTime() + ''
        cert.validity.notBefore = new Date()
        cert.validity.notBefore.setFullYear(cert.validity.notBefore.getFullYear() - 5)
        cert.validity.notAfter = new Date()
        cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 20)
        const attrs = [
            {
                name: 'commonName',
                value: 'sovietironfist-https-mitm-proxy',
            },
            {
                name: 'countryName',
                value: 'CN',
            },
            {
                shortName: 'ST',
                value: 'ChengDu',
            },
            {
                name: 'localityName',
                value: 'ChengDu',
            },
            {
                name: 'organizationName',
                value: 'CCCP',
            },
            {
                shortName: 'OU',
                value: 'https://baidu.com',
            },
        ]
        cert.setSubject(attrs)
        cert.setIssuer(attrs)
        cert.setExtensions([
            {
                name: 'basicConstraints',
                critical: true,
                cA: true,
            },
            {
                name: 'keyUsage',
                critical: true,
                keyCertSign: true,
            },
            {
                name: 'subjectKeyIdentifier',
            },
        ])
        cert.sign(keys.privateKey, forge.md.sha256.create())
        const ca = {
            cert: pki.certificateToPem(cert),
            key: pki.privateKeyToPem(keys.privateKey),
        }
        this.store.save(this.rootCAName, ca)
        return ca
    }

    private genNewSubCA(domain: string) {
        if (!this.rootCACert || !this.rootCAKey) return
        const keys = pki.rsa.generateKeyPair(2049)
        const cert = pki.createCertificate()
        cert.publicKey = keys.publicKey

        cert.serialNumber = new Date().getTime() + ''
        cert.validity.notBefore = new Date()
        cert.validity.notBefore.setFullYear(cert.validity.notBefore.getFullYear() - 1)
        cert.validity.notAfter = new Date()
        cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1)
        const attrs = [
            {
                name: 'commonName',
                value: domain,
            },
            {
                name: 'countryName',
                value: 'CN',
            },
            {
                shortName: 'ST',
                value: 'ChengDu',
            },
            {
                name: 'localityName',
                value: 'ChengDu',
            },
            {
                name: 'organizationName',
                value: 'CCCP',
            },
            {
                shortName: 'OU',
                value: 'https://baidu.com',
            },
        ]

        cert.setIssuer(this.rootCACert.subject.attributes)
        cert.setSubject(attrs)

        cert.setExtensions([
            {
                name: 'basicConstraints',
                critical: true,
                cA: false,
            },
            {
                name: 'keyUsage',
                critical: true,
                digitalSignature: true,
                contentCommitment: true,
                keyEncipherment: true,
                dataEncipherment: true,
                keyAgreement: true,
                keyCertSign: true,
                cRLSign: true,
                encipherOnly: true,
                decipherOnly: true,
            },
            {
                name: 'subjectAltName',
                altNames: [
                    {
                        type: 2,
                        value: domain,
                    },
                ],
            },
            {
                name: 'subjectKeyIdentifier',
            },
            {
                name: 'extKeyUsage',
                serverAuth: true,
                clientAuth: true,
                codeSigning: true,
                emailProtection: true,
                timeStamping: true,
            },
            {
                name: 'authorityKeyIdentifier',
            },
        ])
        cert.sign(this.rootCAKey!, forge.md.sha256.create())

        const ca = {
            cert: pki.certificateToPem(cert),
            key: pki.privateKeyToPem(keys.privateKey),
        }
        this.store.save(domain, ca)
        return ca
    }
    /**
     * 将根证书放到tmp目录下,然后安装证书
     */
    private get rootCAsavePath(): string {
        return path.join(os.tmpdir(), `${this.rootCAName}.crt`)
    }
    /**
     * 存储跟证书到磁盘，用于证书安装
     */
    private saveRootCAToDisk() {
        if (!this.rootCACert) {
            console.warn('根证书未生成！')
            return
        }
        fs.writeFileSync(this.rootCAsavePath, pki.certificateToPem(this.rootCACert))
        console.info(`根证书存放位置：${this.rootCAsavePath}`)
    }

    public installRootCA() {
        this.saveRootCAToDisk()
        console.log(`
for mac: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${this.rootCAsavePath}
for windowns: 请google
for linux: 请google
        `)
    }
    /**
     * 根据子域名获取ca证书
     * @param domain 子域名
     */
    public getCAByDomain(domain: string) {
        const ca = this.store.get(domain) || this.genNewSubCA(domain)
        if (ca) {
            return ca
        }
        throw new Error('获取域名证书错误')
    }

    public get RootCACert(): ICert {
        const rootCa = this.store.get(this.rootCAName)
        if (rootCa) {
            return rootCa
        }
        throw new Error('根证书未生成')
    }
}
