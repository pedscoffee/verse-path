export class ConnectionsController {
    constructor() {
        this.data = null;
        this.cy = null;
    }

    async load() {
        if (!this.data) {
            this.data = await fetch('./assets/data/connections.json').then(r => r.json());
        }
    }

    async showGraph(book, chapter, verse) {
        await this.load();
        const ref = `${book} ${chapter}:${verse}`;
        const connections = this.data[ref] || [];

        // UI Setup
        // Create full screen modal for graph
        let modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[80] bg-stone-50 flex flex-col';
        modal.innerHTML = `
            <div class="flex justify-between items-center p-4 bg-white border-b border-stone-200 shadow-sm z-10">
                <div>
                    <h2 class="font-serif font-bold text-lg text-stone-800">Connections</h2>
                    <p class="text-xs text-stone-500">${ref}</p>
                </div>
                <button id="close-graph-btn" class="p-2 bg-stone-100 rounded-full hover:bg-stone-200">
                    <svg class="w-6 h-6 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div id="cy" class="flex-1 w-full h-full relative bg-stone-50"></div>
            <div class="p-4 bg-white border-t border-stone-200 z-10 text-center text-xs text-stone-400">
                Tap a node to navigate. Drag to explore.
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('close-graph-btn').onclick = () => {
            modal.remove();
            this.cy.destroy();
            this.cy = null;
        };

        // Graph Data Construction
        const elements = [
            { data: { id: 'root', label: ref, type: 'source' } }
        ];

        connections.forEach((conn, i) => {
            const id = `node-${i}`;
            elements.push({ data: { id: id, label: conn.ref, type: 'target' } });
            elements.push({ data: { source: 'root', target: id, label: conn.type } });
        });

        if (connections.length === 0) {
            const noDataId = 'no-data';
            elements.push({ data: { id: noDataId, label: 'No connections found', type: 'info' } });
            elements.push({ data: { source: 'root', target: noDataId, label: '' } });
        }

        // Initialize Cytoscape
        this.cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#57534e', // stone-600
                        'label': 'data(label)',
                        'color': '#fff',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'font-family': 'serif',
                        'font-size': '14px',
                        'width': 'label',
                        'height': 'label',
                        'padding': '12px',
                        'shape': 'round-rectangle',
                        'text-wrap': 'wrap'
                    }
                },
                {
                    selector: 'node[type="source"]',
                    style: {
                        'background-color': '#1c1917', // stone-900
                        'font-weight': 'bold',
                        'font-size': '16px'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#d6d3d1', // stone-300
                        'target-arrow-color': '#d6d3d1',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'label': 'data(label)',
                        'font-size': '10px',
                        'color': '#78716c',
                        'text-background-opacity': 1,
                        'text-background-color': '#fafaf9',
                        'text-background-padding': '2px'
                    }
                }
            ],
            layout: {
                name: 'cose',
                animate: true
            }
        });

        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const label = node.data('label');
            if (label && label !== ref && label !== 'No connections found') {
                // Parse ref (Simple parser)
                // Assuming format "BOOK CH:V"


                if (window.navigateToVerse) {
                    // Robust parser:
                    // Expected: "BOOK CH:V" or "1 BOOK CH:V"
                    // Split by last space to separate VERSE REFERENCE from BOOK NAME
                    const lastSpaceIdx = label.lastIndexOf(' ');
                    if (lastSpaceIdx === -1) return; // Invalid format

                    const bookName = label.substring(0, lastSpaceIdx);
                    const refPart = label.substring(lastSpaceIdx + 1); // "CH:V" or "CH"

                    const cv = refPart.split(':');
                    const ch = parseInt(cv[0]);
                    const v = cv.length > 1 ? parseInt(cv[1]) : 1;

                    window.navigateToVerse(bookName, ch, v);
                    modal.remove();
                }
            }
        });
    }
}

export const connectionsController = new ConnectionsController();
