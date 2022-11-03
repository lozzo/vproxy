import { HTTPTransferProxy, PipelineOptions } from './pipeline'

interface HTTPCacheTransferProxyOptions extends PipelineOptions {}

export class HTTPCacheTransferProxy extends HTTPTransferProxy {
    opt: HTTPCacheTransferProxyOptions
    constructor(opt: HTTPCacheTransferProxyOptions) {
        super(opt)
        this.opt = opt
    }
}
