/**
 * Smart Insights Engine
 * v0.69.0 - 基于规则的剪贴板使用洞察生成
 */
class Insights {
  constructor(db) {
    this.db = db;
  }

  async generateInsights() {
    const insights = [];

    try {
      // Insight 1: 最常复制的内容类型
      const typeStats = this.db.getStatsByType ? this.db.getStatsByType() : [];
      if (typeStats.length > 0) {
        const topType = typeStats[0];
        const typeNames = { text: '文字', code: '代码', file: '文件', image: '图片' };
        const total = typeStats.reduce((a, b) => a + b.count, 0);
        const pct = total > 0 ? Math.round(topType.count / total * 100) : 0;
        insights.push({
          type: 'type',
          icon: '📊',
          title: `你最常复制的是${typeNames[topType.type] || topType.type}`,
          desc: `占比 ${pct}%`,
          priority: 'high'
        });
      }

      // Insight 2: 最活跃的星期
      const weekly = this.db.getWeeklyTrend ? this.db.getWeeklyTrend() : [];
      if (weekly.length > 0) {
        const topDay = weekly.reduce((a, b) => a.count > b.count ? a : b);
        insights.push({
          type: 'day',
          icon: '📅',
          title: `你最活跃的星期是${topDay.day}`,
          desc: `平均 ${topDay.count} 次复制`,
          priority: 'medium'
        });
      }

      // Insight 3: 重复率检查
      const stats = this.db.getStats ? this.db.getStats() : { total: 0 };
      const total = stats.total || 0;
      if (total > 0) {
        // 用 findDuplicates 获取重复数量
        let dupes = 0;
        try {
          const dupResults = this.db.findDuplicates ? this.db.findDuplicates() : [];
          dupes = dupResults.length;
        } catch (e) {
          dupes = 0;
        }
        const dupRate = Math.round(dupes / total * 100);
        if (dupRate > 5) {
          insights.push({
            type: 'duplicate',
            icon: '🔁',
            title: `发现 ${dupes} 组重复内容（${dupRate}%）`,
            desc: dupRate > 20 ? '重复率较高，建议清理' : '可考虑合并重复条目',
            priority: dupRate > 20 ? 'high' : 'medium'
          });
        }
      }

      // Insight 4: 收藏使用情况
      const favCount = stats.favorite || 0;
      if (total > 10 && favCount === 0) {
        insights.push({
          type: 'favorite',
          icon: '⭐',
          title: '你还没有收藏任何内容',
          desc: '重要内容建议收藏，方便快速查找',
          priority: 'low'
        });
      } else if (total > 0) {
        const favRate = Math.round(favCount / total * 100);
        insights.push({
          type: 'favorite',
          icon: '⭐',
          title: `已收藏 ${favCount} 条内容`,
          desc: `占总记录的 ${favRate}%`,
          priority: 'low'
        });
      }

      // Insight 5: AI 功能状态
      try {
        const aiConfig = this.db.getAISettings ? this.db.getAISettings() : {};
        if (aiConfig && aiConfig.ollamaHost) {
          insights.push({
            type: 'ai',
            icon: '🤖',
            title: 'AI 功能已配置',
            desc: '智能摘要和语义搜索可用',
            priority: 'low'
          });
        }
      } catch (e) {
        // AI 未配置，不显示
      }

      return insights;
    } catch (e) {
      console.error('generateInsights error:', e);
      return [];
    }
  }
}

module.exports = Insights;
