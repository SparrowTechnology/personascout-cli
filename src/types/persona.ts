export interface Persona {
  id: string;
  name: string;
  titles: string[];
  company_size: string[];
  pain_points: string[];
  goals: string[];
  funnel_stages: {
    awareness: string;
    consideration: string;
    decision: string;
  };
}
