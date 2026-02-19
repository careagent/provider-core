import type { ChartTemplate } from '../../types.js';

export const hAndPTemplate: ChartTemplate = {
  templateId: 'h-and-p',
  name: 'History and Physical',
  version: '1.0.0',
  sections: [
    {
      name: 'Chief Complaint',
      required: true,
      description: 'Primary reason for the encounter',
      format: 'text',
    },
    {
      name: 'History of Present Illness',
      required: true,
      description: 'Detailed narrative of the presenting illness',
      format: 'text',
    },
    {
      name: 'Past Medical History',
      required: true,
      description: 'Relevant past medical conditions',
      format: 'text',
    },
    {
      name: 'Past Surgical History',
      required: true,
      description: 'Previous surgeries and procedures',
      format: 'text',
    },
    {
      name: 'Medications',
      required: true,
      description: 'Current medications and dosages',
      format: 'list',
    },
    {
      name: 'Allergies',
      required: true,
      description: 'Known allergies and reactions',
      format: 'list',
    },
    {
      name: 'Family History',
      required: false,
      description: 'Relevant family medical history',
      format: 'text',
    },
    {
      name: 'Social History',
      required: false,
      description: 'Social and lifestyle factors',
      format: 'text',
    },
    {
      name: 'Review of Systems',
      required: true,
      description: 'Systematic review of organ systems',
      format: 'text',
    },
    {
      name: 'Physical Examination',
      required: true,
      description: 'General physical examination findings',
      format: 'text',
    },
    {
      name: 'Neurological Examination',
      required: true,
      description:
        'Detailed neurological examination including mental status, cranial nerves, motor, sensory, reflexes, coordination, gait (neurosurgery-specific)',
      format: 'text',
    },
    {
      name: 'Imaging/Studies',
      required: true,
      description:
        'Relevant imaging and laboratory results with interpretation',
      format: 'text',
    },
    {
      name: 'Assessment',
      required: true,
      description: 'Clinical impression and problem list',
      format: 'text',
    },
    {
      name: 'Plan',
      required: true,
      description:
        'Treatment plan, orders, consultations, and follow-up',
      format: 'text',
    },
  ],
};
