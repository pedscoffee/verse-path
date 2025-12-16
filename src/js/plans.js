import { db } from './db.js';

export class PlansController {
    constructor() {
        this.activePlans = [];
        this.availablePlans = [];
    }

    async load() {
        // Load available templates
        this.availablePlans = await fetch('./assets/data/plans.json').then(r => r.json());

        // Load user active plans from DB
        this.activePlans = await db.plans.toArray();
    }

    async startPlan(planId) {
        const template = this.availablePlans.find(p => p.id === planId);
        if (!template) throw new Error('Plan template not found');

        const newPlan = {
            id: `${planId}-${Date.now()}`,
            templateId: planId,
            title: template.name,
            totalDays: template.days,
            startDate: Date.now(),
            completedDays: [], // Array of day numbers (1-indexed)
            progress: 0,
            archived: false
        };

        await db.plans.add(newPlan);
        this.activePlans.push(newPlan);
        return newPlan;
    }

    getDailyReading(plan, dayNum) {
        // Implement logic based on plan type
        const template = this.availablePlans.find(p => p.id === plan.templateId);

        if (!template) return { desc: `Day ${dayNum}`, link: null };

        if (template.type === 'sequential') {
            // E.g. Canonical 1Y. Generic "Read X chapters"
            // We need metadata to know total chapters in Bible (1189).
            // A simple approximation: Map day to a chapter range.
            // For MVP without heavy map: Just generic goal.
            // OR specifically for 'canonical-1y', we can be smarter if we have a book list.

            // Let's implement robust "Read ~3 ch/day" logic if it's canonical
            if (template.id === 'canonical-1y') {
                // Harder to do exact references without full bible structure loaded.
                // Fallback to generic message
                return { desc: `Day ${dayNum}: Read approx. 3 chapters`, link: null };
            }

        } else if (template.type === 'range') {
            // "NT in 30 Days"
            // 260 chapters in NT. 260/30 = 8.6 chapters/day.
            if (template.id === 'nt-30d') {
                // We can be precise here
                const startCh = (dayNum - 1) * 9; // Approx 9 chapters/day
                // This is crude without knowing chapter counts per book perfectly.
                return { desc: `Day ${dayNum}: Read approx. 9 chapters (NT)`, link: null };
            }
        } else if (template.type === 'mixed') {
            // Psalms & Proverbs
            if (template.id === 'psalms-proverbs-monthly') {
                return { desc: `Day ${dayNum}: 5 Psalms + 1 Proverb`, link: null };
            }
        }

        return {
            desc: `Day ${dayNum}: Reading`,
            link: null
        };
    }

    async markDayComplete(planId, dayNum) {
        const plan = this.activePlans.find(p => p.id === planId);
        if (!plan) return;

        if (!plan.completedDays.includes(dayNum)) {
            plan.completedDays.push(dayNum);
            plan.progress = Math.round((plan.completedDays.length / plan.totalDays) * 100);
            await db.plans.put(plan);
        }
    }

    async deletePlan(planId) {
        await db.plans.delete(planId);
        this.activePlans = this.activePlans.filter(p => p.id !== planId);
    }
}

export const plansController = new PlansController();
