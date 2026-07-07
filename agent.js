/* Intelligent WSN AI Agent Module — Weighted Dual-Framework Competitive Selection */

class IntelligentAgent {
    constructor() {
        this.lastDecision = null;
        this.competitionLog = null;
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Suitability Scoring Matrix
    // Assigns suitability points to each framework based on 7 network
    // conditions. Raw scores are then normalized to [0, 1].
    //
    // Condition                  | Traditional | AI
    // ───────────────────────────|─────────────|────
    // 1. High traffic            |     +1      | +3
    // 2. Large node count (>500) |     +1      | +3
    // 3. Large area (>300)       |     +1      | +3
    // 4. Low energy (<40%)       |     +1      | +3
    // 5. Many dead nodes (>20%)  |     +3      | +2
    // 6. Low traffic (stable)    |     +3      | +1
    // 7. Medium traffic          |     +2      | +2
    // ─────────────────────────────────────────────────────────────────
    _suitabilityScores(networkState) {
        const eRatio    = networkState.maxEnergy > 0
            ? networkState.avgEnergy / networkState.maxEnergy : 0;
        const deadRatio = networkState.nodes > 0
            ? networkState.deadNodes / networkState.nodes : 0;

        const highTraffic = networkState.trafficLevel === 'high';
        const medTraffic  = networkState.trafficLevel === 'medium';
        const lowTraffic  = networkState.trafficLevel === 'low';
        const largeNodes  = networkState.nodes > 500;
        const areaLarge   = networkState.areaSize > 300;
        const lowEnergy   = eRatio < 0.4;
        const manyDead    = deadRatio > 0.2;
        const dense       = networkState.density > 20;

        let trad = 0;
        let ai   = 0;

        // Rule 1 — Traffic
        if (highTraffic)  { ai += 3; trad += 1; }
        else if (medTraffic) { trad += 2; ai += 2; }
        else if (lowTraffic) { trad += 3; ai += 1; }

        // Rule 2 — Large node count
        if (largeNodes)   { ai += 3; trad += 1; }

        // Rule 3 — Large area
        if (areaLarge)    { ai += 3; trad += 1; }

        // Rule 4 — Low energy
        if (lowEnergy)    { ai += 3; trad += 1; }

        // Rule 5 — Many dead nodes (AMGSO strength)
        if (manyDead)     { trad += 3; ai += 2; }

        // Dense network bonus for Traditional (TDO is lightweight)
        if (dense && !largeNodes) { trad += 1; }

        // Normalize to [0, 1]
        const maxPossible = Math.max(trad, ai) || 1;
        return {
            tradRaw: trad,
            aiRaw: ai,
            tradNorm: trad / maxPossible,
            aiNorm: ai / maxPossible,
            // flags for reason building
            eRatio, areaLarge, lowEnergy, manyDead, dense,
            highTraffic, medTraffic, lowTraffic, largeNodes
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: Adaptive fitness weights based on context
    // ─────────────────────────────────────────────────────────────────
    _weightsFor(framework, networkState) {
        const eRatio = networkState.maxEnergy > 0
            ? networkState.avgEnergy / networkState.maxEnergy : 0;

        if (framework === 'ai') {
            if (networkState.areaSize > 300)
                return { a: 0.20, b: 0.50, g: 0.15, d: 0.15 }; // distance-heavy
            return { a: 0.20, b: 0.35, g: 0.35, d: 0.10 };     // cost + distance
        } else {
            if (eRatio < 0.4)
                return { a: 0.45, b: 0.25, g: 0.15, d: 0.15 }; // energy-saving
            if (networkState.density > 20)
                return { a: 0.20, b: 0.20, g: 0.40, d: 0.20 }; // hop-minimizing
            return { a: 0.30, b: 0.30, g: 0.20, d: 0.20 };     // balanced
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: Build human-readable reason string
    // ─────────────────────────────────────────────────────────────────
    _buildReason(winner, s, tradFinal, aiFinal) {
        const factors = [];
        if (s.highTraffic)  factors.push('high traffic');
        if (s.largeNodes)   factors.push('large node count (>500)');
        if (s.areaLarge)    factors.push('large network area');
        if (s.lowEnergy)    factors.push('low residual energy');
        if (s.manyDead)     factors.push('many dead nodes detected');
        if (s.lowTraffic && !s.manyDead && !s.largeNodes && !s.areaLarge && !s.lowEnergy)
            factors.push('stable low-traffic network');
        if (s.medTraffic && factors.length === 0)
            factors.push('medium traffic — fitness was decisive');

        const factorStr = factors.length > 0
            ? factors.join(', ')
            : 'balanced network conditions';

        if (winner === 'ai') {
            return `AI framework (PSO+ACO) selected. Detected: ${factorStr}. `
                 + `AI Final Score (${aiFinal.toFixed(4)}) > Traditional (${tradFinal.toFixed(4)}).`;
        } else {
            return `Traditional framework (TDO+CMTO+AMGSO) selected. Detected: ${factorStr}. `
                 + `Traditional Final Score (${tradFinal.toFixed(4)}) ≥ AI (${aiFinal.toFixed(4)}).`;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 4: Main decision method — runs both frameworks, computes
    //         weighted Final Score = 0.7 × Fitness_norm + 0.3 × Suitability_norm
    // ─────────────────────────────────────────────────────────────────
    analyzeAndDecide(networkState, nodesList, bsX, bsY) {
        // --- Optimal CH Count ---
        let optimalCHCount = 6;
        if (nodesList && bsX !== undefined && bsY !== undefined) {
            optimalCHCount = calculateOptimalCH(nodesList, bsX, bsY, networkState.areaSize);
        }

        // ── Suitability scores ────────────────────────────────────
        const s = this._suitabilityScores(networkState);

        // ── Run Traditional Framework ─────────────────────────────
        const tradWeights    = this._weightsFor('traditional', networkState);
        const tradCHIds      = tdoSelectCH(bsX, bsY, optimalCHCount);
        formClusters(tradCHIds);
        const tradCandidates = cmtoGenerate(tradCHIds, bsX, bsY);
        const tradOptimized  = amgsoRoute(tradCandidates);
        const tradPaths      = selectBestPaths(tradOptimized, bsX, bsY, false,
            { weights: tradWeights, priority: 'Traditional', reason: '' });
        const tradFitness    = _avgFitness(tradPaths);

        // ── Run AI Framework ──────────────────────────────────────
        const aiWeights   = this._weightsFor('ai', networkState);
        const aiCHIds     = psoSelectCH(bsX, bsY, optimalCHCount);
        formClusters(aiCHIds);
        const aiCandidates = acoRoute(aiCHIds, bsX, bsY);
        const aiPaths      = selectBestPaths(aiCandidates, bsX, bsY, false,
            { weights: aiWeights, priority: 'AI', reason: '' });
        const aiFitness    = _avgFitness(aiPaths);

        // ── Normalize fitness scores to [0, 1] ────────────────────
        const maxFit = Math.max(tradFitness, aiFitness) || 1;
        const tradFitnessNorm = tradFitness / maxFit;
        const aiFitnessNorm   = aiFitness   / maxFit;

        // ── Weighted Final Score ──────────────────────────────────
        // Final = 0.7 × Fitness_norm  +  0.3 × Suitability_norm
        const W_FITNESS     = 0.7;
        const W_SUITABILITY = 0.3;

        const tradFinalScore = (W_FITNESS * tradFitnessNorm) + (W_SUITABILITY * s.tradNorm);
        const aiFinalScore   = (W_FITNESS * aiFitnessNorm)   + (W_SUITABILITY * s.aiNorm);

        const winner = aiFinalScore >= tradFinalScore ? 'ai' : 'traditional';

        // ── Build reason ──────────────────────────────────────────
        const reason = this._buildReason(winner, s, tradFinalScore, aiFinalScore);

        // ── Set strategy, priority, weights for winner ────────────
        let framework, chStrategy, routingStrategy, weights, priority;

        if (winner === 'ai') {
            framework       = 'ai';
            chStrategy      = 'PSO (AI)';
            routingStrategy = 'ACO (AI)';
            weights         = aiWeights;

            if (s.areaLarge)        priority = 'Distance Optimization';
            else if (s.highTraffic) priority = 'Shortest Path & Cost';
            else if (s.lowEnergy)   priority = 'Energy-Aware AI Routing';
            else                    priority = 'AI-Optimized Routing';
        } else {
            framework = 'traditional';
            weights   = tradWeights;

            if (s.lowEnergy)   {
                chStrategy      = 'Energy-Based TDO';
                routingStrategy = 'Energy-Aware CMTO';
                priority        = 'Energy Saving';
            } else if (s.manyDead) {
                chStrategy      = 'TDO + AMGSO (Dead-Node Handling)';
                routingStrategy = 'AMGSO + CMTO';
                priority        = 'Dead Node Recovery';
            } else if (s.dense) {
                chStrategy      = 'TDO (Dense Network)';
                routingStrategy = 'CMTO (Hop-Optimized)';
                priority        = 'Hop-Count Minimization';
            } else {
                chStrategy      = 'TDO (Standard)';
                routingStrategy = 'CMTO + AMGSO';
                priority        = 'Balanced Optimization';
            }
        }

        // ── Restore winning CH state ──────────────────────────────
        if (winner === 'ai') {
            nodes.forEach(n => n.isCH = false);
            aiCHIds.forEach(id => nodes[id].isCH = true);
            chIds = aiCHIds;
            formClusters(aiCHIds);
        } else {
            nodes.forEach(n => n.isCH = false);
            tradCHIds.forEach(id => nodes[id].isCH = true);
            chIds = tradCHIds;
            formClusters(tradCHIds);
        }

        // ── Store full competition log ─────────────────────────────
        this.competitionLog = {
            traditional: {
                chStrategy:      'TDO',
                routingStrategy: 'CMTO + AMGSO',
                fitness:         tradFitness,
                fitnessNorm:     tradFitnessNorm,
                suitabilityRaw:  s.tradRaw,
                suitabilityNorm: s.tradNorm,
                finalScore:      tradFinalScore,
                weights:         tradWeights
            },
            ai: {
                chStrategy:      'PSO',
                routingStrategy: 'ACO',
                fitness:         aiFitness,
                fitnessNorm:     aiFitnessNorm,
                suitabilityRaw:  s.aiRaw,
                suitabilityNorm: s.aiNorm,
                finalScore:      aiFinalScore,
                weights:         aiWeights
            },
            winner,
            conditions: {
                trafficLevel: networkState.trafficLevel,
                nodes:        networkState.nodes,
                eRatio:       s.eRatio.toFixed(2),
                density:      networkState.density,
                deadNodes:    networkState.deadNodes,
                areaSize:     networkState.areaSize,
                areaLarge:    s.areaLarge,
                largeNodes:   s.largeNodes,
                lowEnergy:    s.lowEnergy,
                manyDead:     s.manyDead,
                dense:        s.dense
            },
            formula: { W_FITNESS, W_SUITABILITY }
        };

        this.lastDecision = {
            framework,
            chStrategy,
            routingStrategy,
            weights,
            priority,
            reason,
            networkState,
            optimalCHCount,
            competitionLog: this.competitionLog
        };

        return this.lastDecision;
    }
}

// ── Helper: average fitness across selectBestPaths result object ──────
function _avgFitness(pathsObj) {
    const vals = Object.values(pathsObj);
    if (vals.length === 0) return 0;
    return vals.reduce((s, v) => s + (v.fitness || 0), 0) / vals.length;
}

// Global Agent Instance
const wsnAgent = new IntelligentAgent();
