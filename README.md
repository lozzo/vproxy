# VProxy

一个像开发 web 服务一样的中间人攻击框架

```typescript
;(async () => {
  const a = await VProxy.create({
    fakeServerPort: 12345,
    httpTunnelPort: 8080,
  })
  a.use(async (ctx: Context) => {
    ctx.resp.write('1\r\n')
    await ctx.next()
    ctx.resp.write('6\r\n')
  })
    .use(async (ctx: Context) => {
      ctx.resp.write('2\r\n')
      await ctx.next()
      ctx.resp.write('5\r\n')
    })
    .use(async (ctx) => {
      ctx.resp.write('3\r\n')
    })
    .use(async (ctx) => {
      ctx.resp.write('4\r\n')
    })
  await a.start()
})()
```
