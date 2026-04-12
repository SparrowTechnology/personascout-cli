import type { Persona } from '../types/persona.js';

export const PERSONA_TEMPLATES: Persona[] = [
  {
    id: 'cfo',
    name: 'CFO / Chief Financial Officer',
    titles: ['CFO', 'Chief Financial Officer', 'VP Finance'],
    company_size: ['50-200', '200-1000', '1000+'],
    pain_points: [
      'I struggle to connect technical spend to measurable business outcomes.',
      "There's no way to see delivery risk before it becomes a board-level issue.",
      'I need clearer visibility into whether engineering investment is reducing or increasing risk.',
    ],
    goals: [
      'Tie software investment to ROI and cash efficiency.',
      'Improve confidence in strategic budgeting decisions.',
      'Give the board a credible view of operational and delivery risk.',
    ],
    funnel_stages: {
      awareness: 'High-level content framing technical risk, delivery delays, and software complexity as financial and operational issues.',
      consideration: 'Comparative content that shows how different approaches improve visibility, forecasting, and capital allocation.',
      decision: 'Proof-oriented content with ROI, implementation confidence, stakeholder alignment, and commercial justification.',
    },
  },
  {
    id: 'cto',
    name: 'CTO / VP Engineering',
    titles: ['CTO', 'VP Engineering', 'Head of Engineering'],
    company_size: ['50-200', '200-1000', '1000+'],
    pain_points: [
      'I struggle to explain architecture risk to non-technical stakeholders.',
      "We can't keep moving fast when delivery depends on fragile systems and unclear tradeoffs.",
      "There's no single view of technical debt, operational risk, and platform complexity.",
    ],
    goals: [
      'Make engineering risk legible across the business.',
      'Improve decision quality around architecture, delivery, and investment.',
      'Build confidence in technical plans without slowing product velocity.',
    ],
    funnel_stages: {
      awareness: 'Thought leadership that defines technical debt, architecture risk, platform complexity, and their impact on delivery.',
      consideration: 'Practical evaluation content comparing frameworks, workflows, and tools for risk visibility and engineering decision-making.',
      decision: 'Detailed implementation, architecture, and proof content that reduces adoption risk and supports internal buy-in.',
    },
  },
  {
    id: 'vp-sales',
    name: 'VP Sales / Head of Sales',
    titles: ['VP Sales', 'Head of Sales', 'Sales Director'],
    company_size: ['50-200', '200-1000'],
    pain_points: [
      'I struggle when deals stall because the buying committee lacks clarity and confidence.',
      "We can't forecast accurately when deal risk sits in product, security, or implementation questions.",
      'I need better content that helps reps move prospects through complex decisions.',
    ],
    goals: [
      'Shorten sales cycles and improve forecast accuracy.',
      'Equip reps with content that resolves late-stage objections.',
      'Increase conversion on higher-complexity deals.',
    ],
    funnel_stages: {
      awareness: 'Content that helps sales leaders understand where deal friction comes from and how buyer committees behave.',
      consideration: 'Operational content about enabling reps, handling objections, and supporting stakeholder-specific conversations.',
      decision: 'Sales-enablement proof points, case studies, and buyer confidence assets that help close complex deals.',
    },
  },
  {
    id: 'vp-marketing',
    name: 'VP Marketing / Head of Marketing',
    titles: ['VP Marketing', 'Head of Marketing', 'Marketing Director'],
    company_size: ['50-200', '200-1000'],
    pain_points: [
      'I struggle to see whether our content strategy actually covers the personas we say we target.',
      "We can't keep producing content without knowing where the funnel is thin or misaligned.",
      'I need a sharper way to connect content output to pipeline quality and persona coverage.',
    ],
    goals: [
      'Build a content strategy tied to ICP coverage and funnel progression.',
      'Make editorial planning more defensible and data-informed.',
      'Improve how marketing demonstrates strategic impact on pipeline.',
    ],
    funnel_stages: {
      awareness: 'Strategic content about ICP definition, content coverage, funnel mapping, and why most content programs drift.',
      consideration: 'Operational content on auditing, classifying, planning, and improving persona-level content systems.',
      decision: 'Proof content showing how a tool or workflow changes planning quality, reporting, and execution confidence.',
    },
  },
  {
    id: 'head-of-marketing',
    name: 'Head of Marketing / Marketing Director',
    titles: ['Head of Marketing', 'Marketing Director', 'Content Marketing Lead'],
    company_size: ['20-100', '100-500'],
    pain_points: [
      'I struggle to balance campaign production with longer-term content strategy.',
      "We can't justify our editorial roadmap when persona coverage is mostly guesswork.",
      'I need a repeatable way to spot content gaps before planning the next quarter.',
    ],
    goals: [
      'Run a more disciplined, persona-aware content program.',
      'Create content plans that hold up under scrutiny from leadership.',
      'Reduce wasted output and improve content reuse.',
    ],
    funnel_stages: {
      awareness: 'Accessible content about content strategy problems, audience coverage, and common planning blind spots.',
      consideration: 'Hands-on workflow content for content audits, gap analysis, reporting, and editorial prioritization.',
      decision: 'Implementation content that shows time savings, operational clarity, and immediate planning value.',
    },
  },
  {
    id: 'it-manager',
    name: 'IT Manager / Head of IT',
    titles: ['IT Manager', 'Head of IT', 'Infrastructure Manager'],
    company_size: ['50-200', '200-1000', '1000+'],
    pain_points: [
      'I struggle with fragmented tooling and poor visibility into operational risk.',
      "We can't support growth when systems, vendors, and internal processes keep getting more complex.",
      'I need practical ways to improve resilience without creating more overhead.',
    ],
    goals: [
      'Reduce operational friction and improve reliability.',
      'Create clearer visibility across systems and dependencies.',
      'Support the business without constant firefighting.',
    ],
    funnel_stages: {
      awareness: 'Educational content on operational complexity, systems visibility, and the cost of fragmented tooling.',
      consideration: 'Practical content comparing tools, workflows, and rollout approaches for IT visibility and control.',
      decision: 'Adoption-oriented content covering implementation effort, integration, governance, and support confidence.',
    },
  },
  {
    id: 'security-engineer',
    name: 'Security Engineer / CISO',
    titles: ['Security Engineer', 'Head of Security', 'CISO'],
    company_size: ['100-500', '500+', '1000+'],
    pain_points: [
      'I struggle when security risk is discussed without enough technical specificity or business context.',
      "We can't influence priorities if security issues only surface after a major incident or audit finding.",
      'I need better ways to communicate exposure, remediation value, and implementation tradeoffs.',
    ],
    goals: [
      'Improve visibility into security exposure and remediation priorities.',
      'Make security tradeoffs easier to explain to technical and executive stakeholders.',
      'Strengthen trust in security decision-making across the business.',
    ],
    funnel_stages: {
      awareness: 'Content that frames security visibility, exposure, and governance in terms security teams and executives both care about.',
      consideration: 'Detailed content comparing approaches to remediation, prioritization, integration, and reporting.',
      decision: 'Technical and governance proof that reduces adoption anxiety and supports procurement or executive approval.',
    },
  },
  {
    id: 'devops-lead',
    name: 'DevOps Lead / Platform Engineer',
    titles: ['DevOps Lead', 'Platform Engineer', 'Head of Platform'],
    company_size: ['50-200', '200-1000'],
    pain_points: [
      'I struggle to keep delivery reliable while the platform surface area keeps expanding.',
      "We can't scale internal engineering support if every team depends on bespoke platform knowledge.",
      'I need clearer signals about bottlenecks, risk, and platform health.',
    ],
    goals: [
      'Improve platform reliability and operational clarity.',
      'Reduce engineering toil and create better internal leverage.',
      'Make delivery more predictable across teams.',
    ],
    funnel_stages: {
      awareness: 'Content about platform complexity, delivery bottlenecks, reliability, and the operational cost of unclear systems.',
      consideration: 'Technical comparison content focused on observability, process design, rollout patterns, and platform governance.',
      decision: 'Implementation-focused proof covering integrations, migration effort, developer adoption, and measurable platform gains.',
    },
  },
  {
    id: 'product-manager',
    name: 'Product Manager / Head of Product',
    titles: ['Product Manager', 'Head of Product', 'VP Product'],
    company_size: ['20-100', '100-500', '500+'],
    pain_points: [
      'I struggle when roadmap decisions are made without enough visibility into technical risk and delivery tradeoffs.',
      "We can't align product ambition with engineering reality if the underlying constraints stay opaque.",
      'I need clearer inputs for prioritization, sequencing, and stakeholder communication.',
    ],
    goals: [
      'Make roadmap decisions with better confidence and fewer surprises.',
      'Improve alignment between product, engineering, and leadership.',
      'Protect delivery credibility while still moving strategically.',
    ],
    funnel_stages: {
      awareness: 'Cross-functional content about roadmap risk, delivery confidence, and the consequences of hidden technical constraints.',
      consideration: 'Framework and workflow content for prioritization, alignment, stakeholder communication, and risk-informed planning.',
      decision: 'Proof content showing how a chosen approach improves product decisions, planning quality, and execution confidence.',
    },
  },
  {
    id: 'founder-early',
    name: 'Founder / CEO (Seed Stage)',
    titles: ['Founder', 'CEO', 'Co-founder'],
    company_size: ['1-10', '10-50'],
    pain_points: [
      'I struggle to make major product and technical bets with limited information and a small team.',
      "We can't afford expensive mistakes in tooling, architecture, or go-to-market priorities.",
      'I need leverage, clarity, and signal without adding heavy process.',
    ],
    goals: [
      'Move quickly without making fragile long-term decisions.',
      'Use limited budget and team capacity well.',
      'Create confidence for investors, customers, and early hires.',
    ],
    funnel_stages: {
      awareness: 'Founder-friendly content about hidden execution risk, strategic clarity, and where early teams lose focus.',
      consideration: 'Practical comparisons of lightweight approaches, tooling, and decision frameworks suited to small teams.',
      decision: 'Proof-oriented content on fast setup, immediate value, and why adoption will not slow the team down.',
    },
  },
  {
    id: 'founder-growth',
    name: 'Founder / CEO (Series A+)',
    titles: ['Founder', 'CEO', 'Co-founder'],
    company_size: ['20-100', '100-500'],
    pain_points: [
      'I struggle when growth exposes execution risk faster than the team can explain or control it.',
      "We can't scale confidently if product, engineering, and go-to-market all see different versions of reality.",
      'I need clearer operating visibility without becoming the bottleneck.',
    ],
    goals: [
      'Scale the company with fewer execution surprises.',
      'Improve confidence in strategic planning and leadership alignment.',
      'Create better visibility for investors, board members, and senior hires.',
    ],
    funnel_stages: {
      awareness: 'Executive content on scaling risk, operating visibility, and the cost of decision-making without shared context.',
      consideration: 'Growth-stage content comparing tooling, process, and reporting approaches for a more mature operating cadence.',
      decision: 'Adoption and ROI content focused on leadership leverage, implementation confidence, and cross-functional buy-in.',
    },
  },
  {
    id: 'ma-analyst',
    name: 'M&A Analyst / Due Diligence Lead',
    titles: ['M&A Analyst', 'Due Diligence Lead', 'Corporate Development Manager'],
    company_size: ['200-1000', '1000+'],
    pain_points: [
      'I struggle to assess technical and operational risk fast enough during a live transaction.',
      "We can't rely on fragmented documentation when diligence questions need clear evidence quickly.",
      'I need stronger ways to translate technical findings into deal risk and integration implications.',
    ],
    goals: [
      'Improve the speed and quality of technology diligence.',
      'Reduce uncertainty in investment and transaction decisions.',
      'Present clearer findings to decision-makers who are not deeply technical.',
    ],
    funnel_stages: {
      awareness: 'Content about technology diligence blind spots, integration risk, and why software complexity changes transaction outcomes.',
      consideration: 'Detailed content comparing diligence methods, risk frameworks, and reporting approaches for transaction work.',
      decision: 'Proof content demonstrating speed, confidence, and credibility in real diligence and post-deal integration scenarios.',
    },
  },
  {
    id: 'pe-partner',
    name: 'Private Equity Partner / Operating Partner',
    titles: ['Private Equity Partner', 'Operating Partner', 'Portfolio Operations Lead'],
    company_size: ['1000+', 'portfolio-wide'],
    pain_points: [
      'I struggle when portfolio technology risk is discussed too late or in terms that are not investment-ready.',
      "We can't improve portfolio performance if the underlying software risk stays hidden until it affects value creation.",
      'I need a higher-level but credible way to see where technical issues threaten growth, margin, or exit readiness.',
    ],
    goals: [
      'Improve portfolio visibility and value-creation planning.',
      'Identify technical risk before it becomes an EBITDA or growth problem.',
      'Strengthen confidence in diligence, operating reviews, and exit preparation.',
    ],
    funnel_stages: {
      awareness: 'Investor-oriented content on how software risk affects value creation, transformation, and exit outcomes.',
      consideration: 'Comparative content on portfolio assessment, diligence, and operating-review workflows.',
      decision: 'Commercial and proof content that shows strategic leverage, reporting quality, and portfolio-wide applicability.',
    },
  },
  {
    id: 'venture-capitalist',
    name: 'VC / Investment Partner',
    titles: ['Investment Partner', 'General Partner', 'Principal'],
    company_size: ['fund-level', 'portfolio-wide'],
    pain_points: [
      'I struggle to evaluate technical maturity without over-indexing on founder storytelling.',
      "We can't support portfolio companies well if we lack clear signals about product and engineering risk.",
      'I need sharper ways to understand how software quality and delivery capability affect growth potential.',
    ],
    goals: [
      'Make better-informed investment and portfolio-support decisions.',
      'Spot technical and operational risk earlier in the company lifecycle.',
      'Support founders with higher-quality operating guidance.',
    ],
    funnel_stages: {
      awareness: 'Investor-focused content on technical maturity, delivery confidence, and the relationship between software quality and company outcomes.',
      consideration: 'Analytical content comparing diligence heuristics, portfolio support models, and risk assessment approaches.',
      decision: 'Trust-building content with concrete use cases, portfolio value, and credible operator or founder proof.',
    },
  },
  {
    id: 'procurement-lead',
    name: 'Procurement Manager / Head of Procurement',
    titles: ['Procurement Manager', 'Head of Procurement', 'Strategic Sourcing Lead'],
    company_size: ['200-1000', '1000+'],
    pain_points: [
      'I struggle when software buying decisions arrive late and already have hidden complexity attached.',
      "We can't govern spend well if evaluation, implementation, and risk details stay informal.",
      'I need clearer vendor information, stakeholder alignment, and confidence in the buying process.',
    ],
    goals: [
      'Run a more controlled and transparent buying process.',
      'Reduce commercial and implementation surprises in software procurement.',
      'Create better cross-functional alignment before contracts are signed.',
    ],
    funnel_stages: {
      awareness: 'Content on the procurement challenges of complex software purchases, stakeholder alignment, and implementation risk.',
      consideration: 'Operational content comparing evaluation criteria, governance processes, and vendor-assessment approaches.',
      decision: 'Decision-stage content with commercial clarity, implementation confidence, stakeholder FAQs, and buying-readiness proof.',
    },
  },
];
