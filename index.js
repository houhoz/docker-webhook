const Koa = require('koa')
const Router = require('koa-router')
const body = require('koa-body') // 用来解析post参数
const crypto = require('crypto')
const secret = '你在webhook中配置的secret'

const app = new Koa()
const router = new Router()

function run_cmd(cmd, args, callback) {
  var spawn = require('child_process').spawn
  var child = spawn(cmd, args)
  var resp = ''
  var endTip = `${args[1]}部署完成, runing on port ${args[2]}`
  child.stdout.on('data', function (buffer) {
    resp += buffer.toString()
  })
  child.stdout.on('end', function () {
    callback(resp + ' ' + endTip)
  })
}

function sign(data) {
  return `sha1=${crypto.createHmac('sha1', secret).update(data).digest('hex')}`
}

app.use(body())

// 一个捕捉错误的中间件
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    console.log(err)
    ctx.throw(500)
  }
})
// post
router.post('/dockerDeploy', async ctx => {
  const port = ctx.query.port
  const header = ctx.request.header
  // 参数就是payload
  const body = ctx.request.body
  // 事件
  const event = header['x-github-event']
  // 签名
  const sig = header['x-hub-signature']
  // 本地生成签名
  const localsig = sign(JSON.stringify(body))
  // 分支
  const ref = body.ref
  // 项目名称
  const name = body.repository.name

  console.log(ref, event, port)
  // 验证签名存在
  if (!sig) {
    ctx.body = 'no signature!'
    return
  }
  // 验证签名合法
  if (sig !== localsig) {
    ctx.body = 'signature is wrong!'
    return
  }
  ctx.body = 'ok'
  // 仅在 push 主分支时处理
  if (ref === 'refs/heads/main' && event === 'push') {
    // 运行
    run_cmd('sh', ['./deploy.sh', name, port], function (text) {
      console.log(text)
    })
  }
})

app.use(router.routes()).use(router.allowedMethods())

app.listen(7777, () => {
  console.log('listening on 7777 success!')
})
