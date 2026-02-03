import { Context, Schema } from 'koishi'

declare module 'koishi' {
  interface Tables {
    roulettes: Roulette
    roulette_groups: RouletteGroup
  }
}

export interface Roulette {
  id: number
  items: string[]
}

export interface RouletteGroup {
  id: number
  name: string
  items: number[]
}

export const name = 'roulettes'

export const inject = {
  required: ['database'],
}

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, _config: Config) {
  // 轮盘抽奖系统数据库模型
  ctx.model.extend('roulettes', {
    id: 'unsigned',
    items: 'list',
  }, {
    primary: 'id',
    autoInc: true,
  })

  ctx.model.extend('roulette_groups', {
    id: 'unsigned',
    name: 'string',
    items: 'json',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // 创建轮盘指令
  ctx.command('roulette/创建轮盘 <items:text>', '创建轮盘（用逗号分隔选项）', { authority: 3 })
    .action(async ({ session }, items) => {
      if (!items) return '请输入轮盘选项，用逗号分隔。\n示例：roulette/创建轮盘 选项1,选项2,选项3'

      const itemsArray = items.split(',').map(item => item.trim()).filter(item => item)
      if (itemsArray.length === 0) return '至少需要一个有效的选项'

      try {
        const roulette = await ctx.model.create('roulettes', {
          items: itemsArray
        })

        return `轮盘创建成功！ID: ${roulette.id}\n包含选项：${itemsArray.join('、')}`
      } catch (error) {
        return '创建轮盘失败：' + error.message
      }
    })

  // 查看轮盘指令
  ctx.command('roulette/轮盘列表 [page:number]', '查看轮盘列表')
    .option('group', '-g 查看轮盘组列表')
    .action(async ({ session, options }, page = 1) => {
      const pageSize = 10

      if (options.group) {
        // 查看轮盘组列表
        const groups = await ctx.model.get('roulette_groups', {})
        const total = groups.length
        const start = (page - 1) * pageSize
        const end = start + pageSize

        const pagedGroups = groups.slice(start, end)

        if (pagedGroups.length === 0) {
          return '暂无轮盘组'
        }

        let message = '轮盘组列表：\n'
        pagedGroups.forEach(group => {
          message += `ID: ${group.id} | 名称: ${group.name} | 包含轮盘数: ${group.items.length}\n`
        })

        message += `\n第${page}页，共${Math.ceil(total / pageSize)}页`
        return message
      } else {
        // 查看轮盘列表
        const roulettes = await ctx.model.get('roulettes', {})
        const total = roulettes.length
        const start = (page - 1) * pageSize
        const end = start + pageSize

        const pagedRoulettes = roulettes.slice(start, end)

        if (pagedRoulettes.length === 0) {
          return '暂无轮盘'
        }

        let message = '轮盘列表：\n'
        pagedRoulettes.forEach(roulette => {
          message += `ID: ${roulette.id} | 选项数: ${roulette.items.length}\n`
          message += `选项: ${roulette.items.join('、')}\n\n`
        })

        message += `第${page}页，共${Math.ceil(total / pageSize)}页`
        return message
      }
    })

  // 创建轮盘组指令
  ctx.command('roulette/创建轮盘组 <name> <rouletteIds:text>', '创建轮盘组（轮盘ID用逗号分隔）', { authority: 3 })
    .action(async ({ session }, name, rouletteIds) => {
      if (!name) return '请输入轮盘组名称'
      if (!rouletteIds) return '请输入轮盘ID，用逗号分隔'

      const ids = rouletteIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      if (ids.length === 0) return '至少需要一个有效的轮盘ID'

      // 验证轮盘是否存在
      for (const id of ids) {
        const roulette = await ctx.model.get('roulettes', { id })
        if (!roulette || roulette.length === 0) {
          return `轮盘 ID ${id} 不存在`
        }
      }

      try {
        const existingGroup = await ctx.model.get('roulette_groups', { name })
        if (existingGroup && existingGroup.length > 0) {
          return '轮盘组名称已存在'
        }

        const group = await ctx.model.create('roulette_groups', {
          name,
          items: ids
        })

        return `轮盘组创建成功！\n名称: ${group.name}\nID: ${group.id}\n包含轮盘: ${ids.join('、')}`
      } catch (error) {
        return '创建轮盘组失败：' + error.message
      }
    })

  // 抽奖指令
  ctx.command('roulette/轮盘抽奖 <target>', '抽奖（输入轮盘ID或轮盘组名称）')
    .option('count', '-c <count:number> 抽奖次数，默认1次', { fallback: 1 })
    .action(async ({ session, options }, target) => {
      if (!target) return '请输入轮盘ID（数字）或轮盘组名称（中文）'

      const count = Math.min(Math.max(1, options.count || 1), 10) // 限制1-10次

      // 判断输入是数字（轮盘ID）还是中文（轮盘组名称）
      const isNumeric = /^\d+$/.test(target)

      if (isNumeric) {
        // 按轮盘ID抽奖逻辑（保持不变）
        const roulette = await ctx.model.get('roulettes', { id: parseInt(target) })
        if (!roulette || roulette.length === 0) {
          return `轮盘 ID ${target} 不存在`
        }

        const items = roulette[0].items
        if (items.length === 0) {
          return '该轮盘没有可抽奖的选项'
        }

        const results = []
        for (let i = 0; i < count; i++) {
          const randomIndex = Math.floor(Math.random() * items.length)
          results.push(items[randomIndex])
        }

        let message = `轮盘 ID: ${target}\n抽奖结果：\n`
        if (count === 1) {
          message += `🎉 ${results[0]} 🎉`
        } else {
          results.forEach((result, index) => {
            message += `${index + 1}. ${result}\n`
          })
        }

        return message
      } else {
        // 按轮盘组名称抽奖
        if (count !== 1) {
          return '轮盘组抽奖不支持指定次数，将从组内每个轮盘各抽取一个结果'
        }

        // 1. 先从 roulette_groups 表获取轮盘组
        const groups = await ctx.model.get('roulette_groups', { name: target })
        if (!groups || groups.length === 0) {
          return `轮盘组 "${target}" 不存在`
        }

        const group = groups[0]
        const rouletteIds = group.items  // 这里应该是轮盘ID数组

        if (!rouletteIds || rouletteIds.length === 0) {
          return '该轮盘组没有包含任何轮盘'
        }

        // 2. 从轮盘组中获取所有轮盘（通过ID）
        const roulettes = await Promise.all(
          rouletteIds.map(async (id) => {
            const roulette = await ctx.model.get('roulettes', { id })
            return roulette && roulette.length > 0 ? roulette[0] : null
          })
        )

        // 3. 过滤掉不存在的轮盘
        const validRoulettes = roulettes.filter(roulette => roulette !== null)
        if (validRoulettes.length === 0) {
          return '轮盘组中的所有轮盘均已不存在'
        }

        // 4. 从每个轮盘中各抽取一个结果
        const results = validRoulettes.map(roulette => {
          if (roulette.items.length === 0) {
            return { id: roulette.id, result: '（无选项）' }
          }
          const randomIndex = Math.floor(Math.random() * roulette.items.length)
          return { id: roulette.id, result: roulette.items[randomIndex] }
        })

        // 5. 构建返回消息
        let message = `轮盘组: ${target}\n抽奖结果（从${results.length}个轮盘中各抽取1个）：\n\n`

        results.forEach((item, index) => {
          message += `${index + 1}. [轮盘ID: ${item.id}] ${item.result}\n`
        })

        return message
      }
    })

  // 删除轮盘指令
  ctx.command('roulette/删除轮盘 <id:number>', '删除轮盘', { authority: 3 })
    .option('group', '-g 删除轮盘组')
    .action(async ({ session, options }, id) => {
      if (!id) return '请输入要删除的ID'

      if (options.group) {
        // 删除轮盘组
        const deleted = await ctx.model.remove('roulette_groups', { id })
        if (deleted) {
          return '轮盘组删除成功'
        } else {
          return '轮盘组不存在'
        }
      } else {
        // 删除轮盘
        const deleted = await ctx.model.remove('roulettes', { id })
        if (deleted) {
          return '轮盘删除成功'
        } else {
          return '轮盘不存在'
        }
      }
    })

  // 查看单个轮盘/轮盘组详情
  ctx.command('roulette/轮盘详情 <target>', '查看轮盘或轮盘组详情')
    .action(async ({ session }, target) => {
      if (!target) return '请输入轮盘ID（数字）或轮盘组名称（中文）'

      const isNumeric = /^\d+$/.test(target)

      if (isNumeric) {
        const roulette = await ctx.model.get('roulettes', { id: parseInt(target) })
        if (!roulette || roulette.length === 0) {
          return `轮盘 ID ${target} 不存在`
        }

        const data = roulette[0]
        return `轮盘 ID: ${data.id}\n选项数: ${data.items.length}\n选项列表：\n${data.items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
      } else {
        const group = await ctx.model.get('roulette_groups', { name: target })
        if (!group || group.length === 0) {
          return `轮盘组 "${target}" 不存在`
        }

        const data = group[0]

        // 获取所有轮盘的详细信息
        let roulettesInfo = ''
        for (const rouletteId of data.items) {
          const roulette = await ctx.model.get('roulettes', { id: rouletteId })
          if (roulette && roulette.length > 0) {
            roulettesInfo += `\n  - 轮盘 ID ${rouletteId}: ${roulette[0].items.length} 个选项`
          } else {
            roulettesInfo += `\n  - 轮盘 ID ${rouletteId}: 已删除`
          }
        }

        return `轮盘组: ${data.name}\nID: ${data.id}\n包含轮盘数: ${data.items.length}\n轮盘列表：${roulettesInfo}`
      }
    })
}
