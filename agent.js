/* Intelligent WSN AI Agent Module */
class IntelligentAgent {
    constructor() {
        this.lastDecision = null;
    }

    analyzeAndDecide(networkState, nodesList, bsX, bsY) {
        /*
        networkState = {
            nodes: number,
            trafficLevel: string ('low', 'medium', 'high'),
            areaSize: number,
            avgEnergy: number,
            maxEnergy: number,
            deadNodes: number,
            density: number
        }
        */

        let framework = 'traditional'; // 'traditional' or 'ai'
        let chStrategy = 'TDO'; 
        let routingStrategy = 'CMTO';
        let weights = { a: 0.25, b: 0.25, g: 0.25, d: 0.25 };
        let reason = "";
        let priority = "";

        let eRatio = networkState.maxEnergy > 0 ? networkState.avgEnergy / networkState.maxEnergy : 0;
        let areaFlag = networkState.areaSize > 300; // Large area

        // Compute optimal CH count dynamically using the optimal cluster head logic
        let optimalCHCount = 6;
        if (nodesList && bsX !== undefined && bsY !== undefined) {
            optimalCHCount = calculateOptimalCH(nodesList, bsX, bsY, networkState.areaSize);
        }

        // Rule-Based Decision Logic
        // According to the traffic, make agent use two sets of algorithms:
        // - High traffic: AI-Based optimization (PSO + ACO) to handle high concurrency, optimize paths and minimize delay.
        // - Low/Medium traffic: Traditional meta-heuristics (TDO + CMTO + AMGSO) which are computationally lightweight to save energy.
        if (networkState.trafficLevel === 'high') {
            framework = 'ai';
            chStrategy = 'PSO (AI)';
            routingStrategy = 'ACO (AI)';
            weights = { a: 0.20, b: 0.35, g: 0.35, d: 0.10 };
            priority = "Shortest Path & Cost";
            reason = "High traffic level detected. AI framework (PSO + ACO) selected to optimize shortest paths and minimize packet delay/hops.";
        } else if (eRatio < 0.4) {
            framework = 'traditional';
            chStrategy = 'Energy-Based CH';
            routingStrategy = 'Energy-Aware CMTO';
            weights = { a: 0.45, b: 0.25, g: 0.15, d: 0.15 };
            priority = "Energy Saving";
            reason = "Low network energy detected. Lightweight Traditional framework selected with maximum energy weight (alpha) to prolong lifetime.";
        } else if (areaFlag) {
            framework = 'ai';
            chStrategy = 'Distance-Optimized CH (PSO)';
            routingStrategy = 'Distance-Aware ACO';
            weights = { a: 0.20, b: 0.50, g: 0.15, d: 0.15 };
            priority = "Distance Optimization";
            reason = "Large network area detected. AI framework (PSO + ACO) selected to prioritize distance optimization and prevent link failures.";
        } else if (networkState.density > 20) {
            framework = 'traditional';
            chStrategy = 'TDO (Standard)';
            routingStrategy = 'CMTO (Standard)';
            weights = { a: 0.20, b: 0.20, g: 0.40, d: 0.20 };
            priority = "Hop-Count Minimization";
            reason = "Dense network detected. Traditional framework selected with higher cost weight (gamma) to avoid congestion and redundant hops.";
        } else {
            framework = 'traditional';
            chStrategy = 'TDO (Standard)';
            routingStrategy = 'CMTO (Standard)';
            weights = { a: 0.30, b: 0.30, g: 0.20, d: 0.20 };
            priority = "Balanced Optimization";
            reason = "Normal network conditions and traffic detected. Traditional framework with balanced adaptive weights selected.";
        }

        this.lastDecision = {
            framework,
            chStrategy,
            routingStrategy,
            weights,
            priority,
            reason,
            networkState,
            optimalCHCount
        };

        return this.lastDecision;
    }
}

// Global Agent Instance
const wsnAgent = new IntelligentAgent();

