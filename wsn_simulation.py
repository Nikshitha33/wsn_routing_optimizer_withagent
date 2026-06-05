"""
WSN Routing Optimization Simulation
Fitness Function Calculation using TDO, CMTO, AMGSO & Adaptive Fitness
Main execution script - run this file.

Upgrades:
  - Interactive configuration (user inputs node count, area, etc.)
  - Multi-round simulation with energy drain
  - Dead node detection & re-routing
  - Before vs After visualization (initial network + optimal path)
"""
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from core import (
    deploy_nodes, tdo_cluster_head_selection, form_clusters,
    cmto_path_generation, amgso_routing, select_best_paths,
    calculate_path_params, adaptive_weights,
    pso_cluster_head_selection, aco_path_finding,
    calculate_optimal_ch, IntelligentAgent,
    choose_cluster_head, fitness_cluster_head_selection
)

def print_header(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

# ------------------------------------------------------------------
# INTERACTIVE CONFIGURATION
# ------------------------------------------------------------------
def get_config():
    """Let the user configure simulation parameters interactively."""
    print_header("WSN SIMULATION - CONFIGURATION")
    print("  Configure the network parameters below.")
    print("  Press ENTER to accept the [default] value.\n")

    def ask(prompt, default, cast=int):
        val = input(f"    {prompt} [{default}]: ").strip()
        if val == "":
            return default
        try:
            return cast(val)
        except ValueError:
            print(f"      Invalid input, using default: {default}")
            return default

    num_nodes  = ask("Number of sensor nodes", 50)
    area_size  = ask("Area size (m x m)",      100)
    comm_range = ask("Communication range (m)", 35)
    bs_x       = ask("Base Station X position", area_size)
    bs_y       = ask("Base Station Y position", area_size)
    num_rounds = ask("Number of simulation rounds", 5)
    energy_per_tx = ask("Energy cost per hop (x0.001 J)", 10, float) / 1000.0

    print("\n    Select Network Traffic Level:")
    print("      1. Low")
    print("      2. Medium [default]")
    print("      3. High")
    traffic_opt = ask("Traffic option", 2)
    traffic_level = "medium"
    if traffic_opt == 1:
        traffic_level = "low"
    elif traffic_opt == 3:
        traffic_level = "high"

    print("\n    Choose Optimization Framework:")
    print("      1. Traditional Framework (TDO + CMTO + AMGSO)")
    print("      2. AI-Based Framework (PSO + ACO + AI Agent)")
    print("      3. Dynamic Framework (AI Agent Controlled - selects based on traffic) [default]")
    framework = ask("Framework option", 3)
    if framework not in [1, 2, 3]:
        framework = 3

    config = {
        'num_nodes': num_nodes, 'area_size': area_size,
        'comm_range': comm_range,
        'bs_x': bs_x, 'bs_y': bs_y,
        'num_rounds': num_rounds, 'energy_per_tx': energy_per_tx,
        'framework': framework, 'traffic_level': traffic_level
    }

    print("\n  Final Configuration:")
    for k, v in config.items():
        print(f"    {k:20s} = {v}")
    return config

# ------------------------------------------------------------------
# RUN ONE ROUND of the optimization pipeline
# ------------------------------------------------------------------
def run_round(nodes, config, round_num, verbose=True):
    """Execute one full optimization round. Returns best result dict."""
    bs_x = config['bs_x']
    bs_y = config['bs_y']
    alive_count = sum(1 for nd in nodes if nd.is_alive)

    if verbose:
        print_header(f"ROUND {round_num} (Alive nodes: {alive_count}/{config['num_nodes']})")

    if alive_count < 3:
        print("  Not enough alive nodes to continue.")
        return None

    # Calculate optimal CH count dynamically
    optimal_ch = calculate_optimal_ch(nodes, config['area_size'], bs_x, bs_y)
    effective_ch = min(optimal_ch, alive_count - 1)

    # --- AI AGENT LAYER ---
    avg_energy = sum(nd.energy for nd in nodes if nd.is_alive) / alive_count if alive_count > 0 else 0.5
    max_energy = max(nd.initial_energy for nd in nodes) if nodes else 0.5
    density = (alive_count / (config['num_nodes'] / 10.0)) if config['num_nodes'] > 0 else 0
    
    network_state = {
        'nodes': config['num_nodes'],
        'traffic_level': config.get('traffic_level', 'medium'),
        'area_size': config['area_size'],
        'avg_energy': avg_energy,
        'max_energy': max_energy,
        'dead_nodes': config['num_nodes'] - alive_count,
        'density': density
    }
    
    agent = IntelligentAgent()
    agent_decision = agent.analyze_and_decide(network_state)
    
    framework = config.get('framework', 3)
    if framework == 3:
        active_framework = agent_decision['framework']
    else:
        active_framework = framework

    if verbose:
        print(f"  [AI Agent] Calculated Optimal Cluster Head Count: {optimal_ch} (effective: {effective_ch})")
        print(f"  [AI Agent] Dynamic Traffic-Based Framework Selection: {'AI-Based (PSO+ACO)' if active_framework == 2 else 'Traditional (TDO+CMTO+AMGSO)'}")
        print(f"  [AI Agent] Priority: {agent_decision['priority']}")
        print(f"  [AI Agent] Reason: {agent_decision['reason']}")

    # Step 1: Cluster Head Selection (TDO, PSO or Fitness-Based)
    if active_framework == 2:
        ch_ids = pso_cluster_head_selection(nodes, bs_x, bs_y, effective_ch)
        if verbose:
            print(f"  [PSO]   Selected {len(ch_ids)} Cluster Heads: {ch_ids}")
    else:
        if agent_decision and agent_decision.get('ch_strategy') == 'Energy-Based CH':
            ch_ids = fitness_cluster_head_selection(nodes, bs_x, bs_y, effective_ch)
            if verbose:
                print(f"  [Fitness-Based CH] Selected {len(ch_ids)} Cluster Heads: {ch_ids}")
        else:
            ch_ids = tdo_cluster_head_selection(nodes, bs_x, bs_y, effective_ch)
            if verbose:
                print(f"  [TDO]   Selected {len(ch_ids)} Cluster Heads: {ch_ids}")

    # Step 2: Cluster Formation
    clusters = form_clusters(nodes, ch_ids)
    if verbose:
        for cid, members in clusters.items():
            print(f"  [Cluster] CH {cid:2d} -> {len(members)} members")

    # Step 3: CMTO or ACO Path Finding
    if active_framework == 2:
        optimized_paths = aco_path_finding(nodes, ch_ids, bs_x, bs_y)
        if verbose:
            total_paths = sum(len(p) for p in optimized_paths.values())
            print(f"  [ACO]   Calculated {total_paths} optimal paths")
    else:
        candidate_paths = cmto_path_generation(nodes, ch_ids, bs_x, bs_y)
        if verbose:
            total_paths = sum(len(p) for p in candidate_paths.values())
            print(f"  [CMTO]  Generated {total_paths} total candidate paths")

        # Step 4: AMGSO Routing Optimization
        optimized_paths = amgso_routing(nodes, candidate_paths, bs_x, bs_y)
        if verbose:
            total_opt = sum(len(p) for p in optimized_paths.values())
            print(f"  [AMGSO] Optimized to {total_opt} viable paths")

    # Steps 5-8: Fitness Evaluation & Path Selection
    results = select_best_paths(nodes, optimized_paths, bs_x, bs_y, agent_decision)

    if not results:
        print("  No valid paths found this round.")
        return None

    # Find overall best
    best_ch = max(results, key=lambda c: results[c]['fitness'])
    best = results[best_ch]
    best['ch_id'] = best_ch
    best['ch_ids'] = ch_ids
    best['clusters'] = clusters
    best['all_results'] = results

    if verbose:
        w = best['weights']
        print(f"  [Weights] a={w[0]:.3f} b={w[1]:.3f} g={w[2]:.3f} d={w[3]:.3f}")
        path_str = " -> ".join(str(n) for n in best['path'])
        print(f"  [BEST]  Path: {path_str} -> BS")
        print(f"          Fitness={best['fitness']:.4f}  Energy={best['energy']:.4f}J  "
              f"Dist={best['distance']:.1f}m  Cost={best['cost']:.0f}hops")

    return best

# ------------------------------------------------------------------
# DRAIN ENERGY along a path (simulate data transmission)
# ------------------------------------------------------------------
def drain_energy(nodes, path, energy_per_tx):
    """Reduce energy for each node on the path. Mark dead nodes."""
    dead_this_round = []
    for nid in path:
        nodes[nid].energy -= energy_per_tx
        if nodes[nid].energy <= 0:
            nodes[nid].energy = 0
            nodes[nid].is_alive = False
            dead_this_round.append(nid)
    return dead_this_round

# ------------------------------------------------------------------
# PRINT DETAILED OPTIMAL PARAMETERS
# ------------------------------------------------------------------
def print_optimal_params(nodes, best, bs_x, bs_y):
    """Print detailed tables for the final optimal path."""
    print(f"\n  * BEST ROUTE (via CH {best['ch_id']}):")
    print(f"    Path: {' -> '.join(str(n) for n in best['path'])} -> BS\n")

    print("  +---------------------------+----------------+")
    print("  |       Parameter           |     Value      |")
    print("  +---------------------------+----------------+")
    print(f"  |  Fitness Score             |   {best['fitness']:.5f}       |")
    print(f"  |  Total Energy (E)         |   {best['energy']:.4f} J     |")
    print(f"  |  Total Distance (D)       |   {best['distance']:.2f} m    |")
    print(f"  |  Cost / Hops (C)          |   {best['cost']:.0f} hops       |")
    print(f"  |  Path Quality (P)         |   {best['quality']:.4f}       |")
    print(f"  |  Heuristic Value (H)      |   {best['heuristic']:.4f}       |")
    w = best['weights']
    print(f"  |  Weight a (Energy)        |   {w[0]:.4f}        |")
    print(f"  |  Weight b (Distance)      |   {w[1]:.4f}        |")
    print(f"  |  Weight g (Cost)          |   {w[2]:.4f}        |")
    print(f"  |  Weight d (Quality)       |   {w[3]:.4f}        |")
    print("  +---------------------------+----------------+")

    print("\n  Nodes on Optimal Path:")
    print("  +--------+------------+------------+-----------+--------+")
    print("  | NodeID |   X (m)    |   Y (m)    | Energy(J) | Status |")
    print("  +--------+------------+------------+-----------+--------+")
    for nid in best['path']:
        nd = nodes[nid]
        status = "ALIVE" if nd.is_alive else "DEAD "
        print(f"  |  {nid:3d}   |  {nd.x:8.2f}  |  {nd.y:8.2f}  |  {nd.energy:.4f}  | {status}  |")
    print(f"  |   BS   |  {bs_x:8.2f}  |  {bs_y:8.2f}  |    inf    | SINK   |")
    print("  +--------+------------+------------+-----------+--------+")

    print("\n  Hop-by-Hop Distance Breakdown:")
    opt_path = best['path']
    for i in range(len(opt_path) - 1):
        d = nodes[opt_path[i]].distance_to(nodes[opt_path[i+1]].x, nodes[opt_path[i+1]].y)
        print(f"    Node {opt_path[i]:2d} -> Node {opt_path[i+1]:2d} : {d:.2f} m")
    last_d = nodes[opt_path[-1]].distance_to(bs_x, bs_y)
    print(f"    Node {opt_path[-1]:2d} -> BS       : {last_d:.2f} m")
    print(f"    Total                  : {best['distance']:.2f} m")

# ------------------------------------------------------------------
# VISUALIZATION: Before (all nodes) + After (optimal path)
# ------------------------------------------------------------------
def plot_simulation(nodes, best, config, round_history):
    """Draw two side-by-side plots: initial network + optimal path."""
    bs_x = config['bs_x']
    bs_y = config['bs_y']
    area = config['area_size']
    ch_ids = best['ch_ids']
    clusters = best['clusters']
    opt_path = best['path']

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8))
    fig.patch.set_facecolor('#f0f0f0')
    fig.suptitle("WSN Simulation - Adaptive Fitness with TDO, CMTO & AMGSO",
                 fontsize=14, fontweight='bold', y=0.98)

    # =============== LEFT PLOT: Initial Network Configuration ===============
    ax1.set_facecolor('#fafafa')
    ax1.set_title("Initial Network Configuration\n(All Nodes & Clusters)", fontsize=11, pad=10)

    # Cluster links
    for cid, members in clusters.items():
        for mid in members:
            ax1.plot([nodes[cid].x, nodes[mid].x], [nodes[cid].y, nodes[mid].y],
                     '--', color='#dddddd', linewidth=0.5, zorder=1)

    # All nodes colored by energy (heatmap style)
    for nd in nodes:
        if not nd.is_alive:
            # Dead nodes: gray X
            ax1.plot(nd.x, nd.y, 'x', color='#999999', markersize=8, zorder=3)
            ax1.text(nd.x+1, nd.y+1, str(nd.id), fontsize=5, color='#bbbbbb')
        elif nd.id in ch_ids:
            # Cluster Heads: red triangles
            ax1.plot(nd.x, nd.y, '^', color='#e74c3c', markersize=12,
                     markeredgecolor='darkred', markeredgewidth=1, zorder=4)
            ax1.text(nd.x+1.5, nd.y+1.5, f"CH{nd.id}", fontsize=6,
                     fontweight='bold', color='#c0392b')
        else:
            # Normal nodes: color by energy level
            ratio = nd.energy / nd.initial_energy
            if ratio > 0.6:
                clr = '#27ae60'  # green = healthy
            elif ratio > 0.3:
                clr = '#f39c12'  # orange = medium
            else:
                clr = '#e74c3c'  # red = critical
            ax1.plot(nd.x, nd.y, 'o', color=clr, markersize=7,
                     markeredgecolor='white', markeredgewidth=0.5, zorder=3)
            ax1.text(nd.x+1, nd.y+1, str(nd.id), fontsize=5, color='#777777')

    # Base station
    ax1.plot(bs_x, bs_y, 's', color='black', markersize=14, zorder=5)
    ax1.text(bs_x-16, bs_y+4, "Base Station", fontsize=8, fontweight='bold')

    # Energy legend for left plot
    energy_legend = [
        Line2D([0],[0], marker='o', color='w', markerfacecolor='#27ae60', markersize=8, label='Energy > 60%'),
        Line2D([0],[0], marker='o', color='w', markerfacecolor='#f39c12', markersize=8, label='Energy 30-60%'),
        Line2D([0],[0], marker='o', color='w', markerfacecolor='#e74c3c', markersize=8, label='Energy < 30%'),
        Line2D([0],[0], marker='x', color='#999999', markersize=8, label='Dead Node', linestyle='None'),
        Line2D([0],[0], marker='^', color='w', markerfacecolor='#e74c3c', markersize=10, label='Cluster Head'),
        Line2D([0],[0], marker='s', color='w', markerfacecolor='black', markersize=9, label='Base Station'),
    ]
    ax1.legend(handles=energy_legend, loc='upper left', fontsize=7, framealpha=0.9)
    ax1.set_xlabel("X (m)"); ax1.set_ylabel("Y (m)")
    ax1.set_xlim(-5, area+15); ax1.set_ylim(-10, area+15)
    ax1.grid(True, alpha=0.2, linestyle='--')

    # Node count info
    alive = sum(1 for nd in nodes if nd.is_alive)
    dead  = sum(1 for nd in nodes if not nd.is_alive)
    ax1.text(0.98, 0.02, f"Alive: {alive}  Dead: {dead}",
             transform=ax1.transAxes, fontsize=8, ha='right',
             bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))

    # =============== RIGHT PLOT: Optimal Path ===============
    ax2.set_facecolor('#fafafa')
    ax2.set_title("Optimal Routing Path\n(Selected by Adaptive Fitness Function)", fontsize=11, pad=10)

    # Draw all nodes faded
    for nd in nodes:
        if not nd.is_alive:
            ax2.plot(nd.x, nd.y, 'x', color='#cccccc', markersize=6, zorder=2)
        elif nd.id not in [n for n in opt_path]:
            ax2.plot(nd.x, nd.y, 'o', color='#c0d6e4', markersize=5, alpha=0.4, zorder=2)
            ax2.text(nd.x+1, nd.y+1, str(nd.id), fontsize=5, color='#cccccc')

    # CH markers (faded if not on optimal path)
    for cid in ch_ids:
        if cid not in opt_path:
            nd = nodes[cid]
            ax2.plot(nd.x, nd.y, '^', color='#f5b7b1', markersize=10, alpha=0.5, zorder=3)

    # Optimal path glow
    for i in range(len(opt_path)-1):
        ax2.plot([nodes[opt_path[i]].x, nodes[opt_path[i+1]].x],
                 [nodes[opt_path[i]].y, nodes[opt_path[i+1]].y],
                 '-', color='lime', linewidth=10, alpha=0.2, zorder=4)
    ax2.plot([nodes[opt_path[-1]].x, bs_x], [nodes[opt_path[-1]].y, bs_y],
             '-', color='lime', linewidth=10, alpha=0.2, zorder=4)

    # Optimal path main line
    for i in range(len(opt_path)-1):
        ax2.plot([nodes[opt_path[i]].x, nodes[opt_path[i+1]].x],
                 [nodes[opt_path[i]].y, nodes[opt_path[i+1]].y],
                 '-', color='#27ae60', linewidth=3, zorder=5)
        # Arrow direction
        mx = (nodes[opt_path[i]].x + nodes[opt_path[i+1]].x) / 2
        my = (nodes[opt_path[i]].y + nodes[opt_path[i+1]].y) / 2
        dx = nodes[opt_path[i+1]].x - nodes[opt_path[i]].x
        dy = nodes[opt_path[i+1]].y - nodes[opt_path[i]].y
        ax2.annotate("", xy=(mx+dx*0.15, my+dy*0.15), xytext=(mx-dx*0.15, my-dy*0.15),
                     arrowprops=dict(arrowstyle='->', color='#27ae60', lw=2), zorder=6)
    ax2.plot([nodes[opt_path[-1]].x, bs_x], [nodes[opt_path[-1]].y, bs_y],
             '-', color='#27ae60', linewidth=3, zorder=5)

    # Highlight optimal path nodes
    for nid in opt_path:
        nd = nodes[nid]
        ax2.plot(nd.x, nd.y, 'o', color='#2ecc71', markersize=14,
                 markeredgecolor='#1a8c4e', markeredgewidth=2, zorder=7)
        ax2.text(nd.x-2, nd.y-5, f"N{nid}\n({nd.energy:.3f}J)", fontsize=6,
                 fontweight='bold', color='#1a8c4e', ha='center')

    # Base station
    ax2.plot(bs_x, bs_y, 's', color='black', markersize=15, zorder=8)
    ax2.text(bs_x-16, bs_y+4, "Base Station", fontsize=9, fontweight='bold')

    # Info box
    info_text = (
        f"OPTIMAL PARAMETERS\n"
        f"Path: {' -> '.join(str(n) for n in opt_path)} -> BS\n"
        f"Fitness:  {best['fitness']:.4f}\n"
        f"Energy:   {best['energy']:.4f} J\n"
        f"Distance: {best['distance']:.2f} m\n"
        f"Cost:     {best['cost']:.0f} hops\n"
        f"Quality:  {best['quality']:.4f}\n"
        f"Heuristic:{best['heuristic']:.4f}"
    )
    props = dict(boxstyle='round,pad=0.5', facecolor='#eafaf1', edgecolor='#27ae60', alpha=0.95)
    ax2.text(0.02, 0.02, info_text, transform=ax2.transAxes, fontsize=7.5,
             verticalalignment='bottom', fontfamily='monospace', bbox=props)

    # Legend
    path_legend = [
        Line2D([0],[0], marker='o', color='w', markerfacecolor='#2ecc71', markersize=10, label='Path Node'),
        Line2D([0],[0], color='#27ae60', linewidth=3, label='Optimal Path'),
        Line2D([0],[0], marker='o', color='w', markerfacecolor='#c0d6e4', markersize=7, label='Other Node'),
        Line2D([0],[0], marker='x', color='#cccccc', markersize=8, label='Dead Node', linestyle='None'),
        Line2D([0],[0], marker='s', color='w', markerfacecolor='black', markersize=9, label='Base Station'),
    ]
    ax2.legend(handles=path_legend, loc='upper left', fontsize=7, framealpha=0.9)
    ax2.set_xlabel("X (m)"); ax2.set_ylabel("Y (m)")
    ax2.set_xlim(-5, area+15); ax2.set_ylim(-10, area+15)
    ax2.grid(True, alpha=0.2, linestyle='--')

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    plt.savefig("wsn_simulation.png", dpi=150, bbox_inches='tight')
    print("  Saved: wsn_simulation.png")
    plt.show()

# ------------------------------------------------------------------
# MAIN
# ------------------------------------------------------------------
def main():
    # Interactive configuration
    config = get_config()

    # Deploy nodes
    print_header("DEPLOYING SENSOR NETWORK")
    nodes = deploy_nodes(config['num_nodes'], config['area_size'], config['comm_range'])
    config['num_ch'] = calculate_optimal_ch(nodes, config['area_size'], config['bs_x'], config['bs_y'])
    print(f"  Deployed {config['num_nodes']} nodes in {config['area_size']}x{config['area_size']}m area")
    print(f"  Communication range: {config['comm_range']}m")
    print(f"  Base Station at ({config['bs_x']}, {config['bs_y']})")
    print(f"\n  All Node Details:")
    print("  +------+----------+----------+-----------+----------+")
    print("  |  ID  |   X (m)  |   Y (m)  | Energy(J) | Neighbors|")
    print("  +------+----------+----------+-----------+----------+")
    for nd in nodes:
        print(f"  | {nd.id:3d}  | {nd.x:8.2f} | {nd.y:8.2f} |  {nd.energy:.4f}  |    {len(nd.neighbors):2d}    |")
    print("  +------+----------+----------+-----------+----------+")

    # Multi-round simulation
    round_history = []
    best_overall = None

    for r in range(1, config['num_rounds'] + 1):
        best = run_round(nodes, config, r)
        if best is None:
            print("  Network is dead. Stopping simulation.")
            break

        round_history.append({
            'round': r,
            'fitness': best['fitness'],
            'energy': best['energy'],
            'distance': best['distance'],
            'cost': best['cost'],
            'path': list(best['path']),
            'alive': sum(1 for nd in nodes if nd.is_alive)
        })

        # Drain energy along the selected path
        dead_nodes = drain_energy(nodes, best['path'], config['energy_per_tx'])
        if dead_nodes:
            print(f"  [ALERT] Nodes died this round: {dead_nodes}")

        # Keep track of the latest best
        best_overall = best

    if best_overall is None:
        print("  No successful rounds. Exiting.")
        return

    # Print round-by-round summary
    print_header("MULTI-ROUND SUMMARY")
    print("  +-------+---------+----------+---------+------+-------+")
    print("  | Round | Fitness |  Energy  |  Dist   | Hops | Alive |")
    print("  +-------+---------+----------+---------+------+-------+")
    for rh in round_history:
        print(f"  |   {rh['round']:2d}  | {rh['fitness']:.4f}  | {rh['energy']:.4f}J | {rh['distance']:6.1f}m |  {rh['cost']:.0f}   |  {rh['alive']:3d}  |")
    print("  +-------+---------+----------+---------+------+-------+")

    # Print detailed optimal parameters for the final round
    print_header("FINAL OPTIMAL PATH & PARAMETERS")
    print_optimal_params(nodes, best_overall, config['bs_x'], config['bs_y'])

    # Visualization
    print_header("GENERATING VISUALIZATION...")
    plot_simulation(nodes, best_overall, config, round_history)
    print("\n  [OK] Simulation Complete!")

if __name__ == "__main__":
    main()
