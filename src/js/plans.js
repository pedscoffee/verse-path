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
        // Simple logic for MVP:
        // Assume simplified "Canonical" logic where we just divide chapters or hardcode ranges
        // Creating a true daily calculator for all Bibles is complex.
        // For MVP, allow "Check In" validation rather than strict "Read Gen 1-3".
        // Or implement a simple "Next Chapter" tracker.

        // Let's implement a generic "Goal" based approach for MVP.
        const template = this.availablePlans.find(p => p.id === plan.templateId);

        if (template.id === 'canonical-1y') {
            // Approx 1189 chapters / 365 = ~3.25 chapters/day.
            return {
                desc: `Day ${dayNum}: Read ~3-4 Chapters`,
                link: null // TODO: Calculate exact start/end logic
            };
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
