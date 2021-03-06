const http = require('http')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const url = require('url')

// 递归删除目录
function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function (file) {
      const curPath = path + '/' + file
      if (fs.statSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath)
      } else {
        // delete file
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(path)
  }
}

const resolvePost = req =>
  new Promise(resolve => {
    let chunk = ''
    req.on('data', data => {
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })

http
  .createServer(async (req, res) => {
    const params = url.parse(req.url, true).query
    const port = params?.port
    console.log('receive request')
    console.log(req.url)
    console.log(params?.port)
    if (req.method === 'POST' && req.url.includes(`/github?port=${port}`)) {
      const data = await resolvePost(req)
      const projectDir = path.resolve(__dirname, `./${data.repository.name}`)
      deleteFolderRecursive(projectDir)

      // 拉取仓库最新代码
      execSync(
        `git clone https://github.com/houhoz/${data.repository.name}.git ${projectDir}`,
        {
          stdio: 'inherit',
        }
      )

      // 复制 Dockerfile 到项目目录
      fs.copyFileSync(
        path.resolve(projectDir, './Dockerfile'),
        path.resolve(__dirname, `./Dockerfile`)
      )

      // 复制 .dockerignore 到项目目录
      fs.copyFileSync(
        path.resolve(projectDir, './.dockerignore'),
        path.resolve(__dirname, `./.dockerignore`)
      )

      // 创建 docker 镜像
      execSync(`docker build -t ${data.repository.name}-image:latest .`, {
        stdio: 'inherit',
        cwd: projectDir,
      })

      // // 我们每次生成镜像是都未指定标签，从而重名导致有空悬镜像，删除一下
      // execSync(`docker rmi $(docker images -f "dangling=true" -q)`, {
      //   stdio: 'inherit',
      //   cwd: projectDir,
      // })

      // 销毁 docker 容器
      execSync(
        `docker ps -a -f "name=^${data.repository.name}-container" --format="{{.Names}}" | xargs -r docker stop | xargs -r docker rm`,
        {
          stdio: 'inherit',
        }
      )

      // 创建 docker 容器
      execSync(
        `docker run -d -p ${port}:80 --name ${data.repository.name}-container ${data.repository.name}-image:latest`,
        {
          stdio: 'inherit',
        }
      )

      console.log('deploy success')
    }
    res.end('ok')
  })
  .listen(3000, () => {
    console.log('server:3000 is ready')
  })
