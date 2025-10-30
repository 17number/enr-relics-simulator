importScripts("https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js");
importScripts("https://cdn.jsdelivr.net/npm/d3-array@3.2.4/dist/d3-array.min.js");

let MAX_EFFECT_NUM = 18;
let effectMetaMap = {};
let progressNotified = 0;

function average(arr) {
  if (!arr.length) return 0;
  const total = arr.reduce((cur, val) => cur + val, 0);
  return total / arr.length;
}

function initializeEffectMetaMap(effectMap) {
  if (Object.keys(effectMetaMap).length === 0 && effectMap) {
    effectMetaMap = Object.fromEntries(
      Object.entries(effectMap)
        .map(([id, eff]) => [Number(id), {
          level: eff.level ?? null,
          stack: eff.stack ?? true,
          prefer_left: eff.prefer_left ?? null
        }])
    );
  }
}

const relicSearch = (function() {
  function toCountMap(arr) {
    const m = new Map();
    for (const x of arr) {
      const meta = effectMetaMap[x];
      if (!meta) continue;

      // stack=false の場合は常に1まで
      if (meta.stack === false) {
        if (!m.has(x)) m.set(x, 1);
      } else {
        m.set(x, (m.get(x) || 0) + 1);
      }
    }
    return m;
  }

  function buildSlotCandidates(chalice, relicPool) {
    const slots = [];
    for (let i = 0; i < chalice.colors.length; i++) {
      const slotColor = chalice.colors[i];
      const needDepth = i >= 3;
      const type = needDepth ? "depth" : "normal";
      if (slotColor === "*") {
        // 全色設定可能
        const cands = relicPool.filter(r => r.type === type);
        slots.push([null, ...cands]);
      } else {
        const cands = relicPool.filter(r => r.color[0].toLowerCase() === slotColor && r.type === type);
        slots.push([null, ...cands]);
      }
    }
    return slots;
  }

  function sortSlotCandidates(chalice, slotCandidates, desiredMap) {
    slotCandidates = sortSlotCandidatesByDesiredPriority(slotCandidates, desiredMap);
    slotCandidates = sortSlotCandidatesByMatchCount(slotCandidates, desiredMap);
    return sortWhiteSlotIfExists(chalice, slotCandidates);
  }

  function sortSlotCandidatesByDesiredPriority(slotCandidates, desiredMap) {
    const desiredIds = [...desiredMap.keys()];
    for (let i = 0; i < slotCandidates.length; i++) {
      const arr = slotCandidates[i];
      arr.sort((A, B) => {
        if (A === null && B === null) return 0;
        if (A === null) return 1;
        if (B === null) return -1;
        const aEffs = (A.effects || []).filter(e => desiredIds.includes(e?.id));
        const bEffs = (B.effects || []).filter(e => desiredIds.includes(e?.id));
        const aAvg = aEffs.length ? average(aEffs.map(e => desiredIds.indexOf(e.id))) : Infinity;
        const bAvg = bEffs.length ? average(bEffs.map(e => desiredIds.indexOf(e.id))) : Infinity;
        return aAvg - bAvg;
      });
    }
    return slotCandidates;
  }

  function sortSlotCandidatesByMatchCount(slotCandidates, desiredMap) {
    for (let i = 0; i < slotCandidates.length; i++) {
      const arr = slotCandidates[i];
      arr.sort((A, B) => {
        if (A === null && B === null) return 0;
        if (A === null) return 1;
        if (B === null) return -1;
        const aCount = (A.effects || []).filter(e => desiredMap.has(e?.id)).length;
        const bCount = (B.effects || []).filter(e => desiredMap.has(e?.id)).length;
        return bCount - aCount;
      });
    }
    return slotCandidates;
  }

  function sortWhiteSlotIfExists(chalice, slotCandidates) {
    if (!chalice.colors.includes("*")) return slotCandidates;
    const wildSlotIdx = chalice.colors.indexOf("*");
    const otherSlotIdxes = [0,1,2].filter(idx => idx !== wildSlotIdx);
    const otherColors = [...new Set(otherSlotIdxes.map(idx => chalice.colors[idx]))];
    const arr = slotCandidates[wildSlotIdx];
    arr.sort((A, B) => {
      if (A === null && B === null) return 0;
      if (A === null) return 1;
      if (B === null) return -1;
      const aHas = !otherColors.includes(A.color[0]);
      const bHas = !otherColors.includes(B.color[0]);
      return (aHas === bHas ? 0 : aHas ? -1 : 1);
    });
    return slotCandidates;
  }

  function computeMatchCount(selectedEffectsBySlot, desiredMap) {
    let matched = 0;
    const detail = {};

    // スロットごとに選ばれた効果を集計
    const selectedCounts = {};
    for (const slotEffs of selectedEffectsBySlot) {
      if (!slotEffs) continue;
      for (const e of slotEffs) {
        const meta = effectMetaMap[e.id];
        if (!meta) continue;
        if (meta.stack === false && selectedCounts[e.id] >= 1) continue; // 重複禁止効果は1回だけ
        selectedCounts[e.id] = (selectedCounts[e.id] || 0) + 1;
      }
    }

    // 希望効果とのマッチ数を算出
    for (const [effId, wantCount] of desiredMap.entries()) {
      const got = Math.min(selectedCounts[effId] || 0, wantCount);
      matched += got;
      detail[effId] = { want: wantCount, got };
    }

    // 平均レベルを算出
    const allLevels = selectedEffectsBySlot.flatMap(slotEffs => slotEffs?.map(e => e.level) || []);
    const avgLevel = average(allLevels);

    // stack=false の希望を考慮した分母（desiredTotal）
    const desiredTotal = Array.from(desiredMap.values()).reduce((a, b) => a + b, 0);

    return { matched, avgLevel, detail, desiredTotal };
  }

  function searchRelicSets(chalices, relicPool, effectMap, desiredEffects, maxResults = 10, startUnix) {
    if (!Array.isArray(desiredEffects) || desiredEffects.length === 0) throw new Error("desiredEffects must be non-empty array");
    if (desiredEffects.length > MAX_EFFECT_NUM) throw new Error(`desiredEffects capped to ${MAX_EFFECT_NUM}`);
    const desiredMap = toCountMap(desiredEffects);
    const results = {};
    chalices.forEach(c => results[c.id] = []);
    function pushResult(chaliceId, r) {
      // 同色が2つ以上あり、セットするスロットが異なっているだけのものは除外
      // ([1,2,3,4,5,6] と [1,3,2,6,5,4] は実質等価)
      const currentRelicIds = r.combo.map(r => r?.id ?? 0).sort();
      const hasSameRelics = results[chaliceId].some(_r => {
        const relicIds = _r.combo.map(r => r?.id ?? 0).sort();
        return relicIds.every((relicId, i) => relicId === currentRelicIds[i]);
      });
      if (hasSameRelics) {
        return;
      }

      results[chaliceId].push(r);
      d3.shuffle(results[chaliceId])
      results[chaliceId].sort((a,b)=> b.score - a.score || b.avgLevel - a.avgLevel || a.emptySlots - b.emptySlots);
      if (results[chaliceId].length > maxResults) {
        const cutoffScore = results[chaliceId][maxResults - 1].score;
        results[chaliceId] = results[chaliceId].filter(r => r.score >= cutoffScore);
        results[chaliceId].length = Math.min(results[chaliceId].length, maxResults * 2);
      }
    }

    for (const chalice of chalices) {
      const slotCandidates = buildSlotCandidates(chalice, relicPool);
      const slotCount = slotCandidates.length;
      for (let i = 0; i < slotCount; i++) {
        d3.shuffle(slotCandidates[i]);
      }

      function dfs(idx, usedIds, combo, selectedEffectsBySlot) {
        // 進捗送信
        const nowUnix = dayjs().valueOf();
        if ((nowUnix - progressNotified) / 1000 > 0.25) {
          progressNotified = nowUnix;
          const elapsed = nowUnix - startUnix;
          postMessage({ progress: {
            chalices,
            chaliceIdx: chalices.indexOf(chalice),
            slotIdx: idx,
            foundResults: d3.sum(Object.keys(results).map(chaliceId => results[chaliceId].length)),
            currentHighestReusults: Object.keys(results).map(chaliceId => results[chaliceId].at(0)).filter(r => r),
            desired: desiredEffects,
            elapsed,
          }});
        }

        if (idx >= slotCount) {
          const { matched, avgLevel, detail, desiredTotal } = computeMatchCount(selectedEffectsBySlot, desiredMap);
          const score = matched / desiredTotal;
          const emptySlots = combo.filter(x => x == null).length;
          pushResult(chalice.id, {
            chaliceId: chalice.id,
            chaliceName: chalice.name,
            chaliceColors: chalice.colors,
            desiredTotal: desiredEffects.length,
            score,
            matched,
            avgLevel,
            detail,
            combo: combo.map(r => ({
              id: r?.id,
              name: r?.name,
              color: r?.color,
              type: r?.type,
              effects: r?.effects || [],
              disadvantages: r?.disadvantages || [],
            })
            ),
            emptySlots
          });

          return;
        }

        const candidates = slotCandidates[idx];
        for (const cand of candidates) {
          if (!cand?.id) {
            combo[idx] = null;
            selectedEffectsBySlot[idx] = null;
          } else {
            if (usedIds.has(cand.id)) continue;
            usedIds.add(cand.id);
            combo[idx] = cand;
            selectedEffectsBySlot[idx] = (cand.effects || []).filter(e => e).map(e => ({ id: e.id, level: e.level }));
          }

          // ---- 枝刈り部分 ----
          const { matched: currMatched } = computeMatchCount(selectedEffectsBySlot, desiredMap);
          const remainingSlot = slotCount - (idx + 1);
          const remainingDesired = desiredEffects.length - currMatched;
          const optimistic = currMatched + Math.min(remainingDesired, remainingSlot * 3);
          const result = results[chalice.id];
          const isNotMax = result.length < maxResults;
          const worst = isNotMax ? 0 : result.at(-1).matched;
          if (isNotMax || optimistic > worst) {
            dfs(idx + 1, usedIds, combo, selectedEffectsBySlot);
          }

          if (cand?.id) usedIds.delete(cand.id);
          combo[idx] = undefined;
          selectedEffectsBySlot[idx] = undefined;
        }
      }

      dfs(0, new Set(), new Array(slotCount), new Array(slotCount));
    }

    return results;
  }

  return { searchRelicSets };
})();

// メインスレッドからメッセージを受信
self.onmessage = function(e) {
  const { startUnix, chalices, relicPool, effectMap, desired, maxResults } = e.data;
  try {
    initializeEffectMetaMap(effectMap);
    let results = relicSearch.searchRelicSets(chalices, relicPool, effectMap, desired, maxResults, startUnix);
    const nowUnix = dayjs().valueOf();
    const elapsed = nowUnix - startUnix;
    // 各献器の結果を単一の array に統合
    results = Object.values(results).flat().sort((a,b)=> b.score - a.score || b.avgLevel - a.avgLevel || a.emptySlots - b.emptySlots);
    postMessage({ success: true, results, desired, elapsed });
  } catch (err) {
    postMessage({ success: false, error: err.message, stack: err.stack });
  }
};
