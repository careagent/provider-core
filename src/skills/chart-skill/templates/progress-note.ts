import type { ChartTemplate } from '../../types.js';

export const progressNoteTemplate: ChartTemplate = {
  templateId: 'progress-note',
  name: 'Progress Note',
  version: '1.0.0',
  sections: [
    {
      name: 'Date/Time',
      required: true,
      description: 'Date and time of the progress note',
      format: 'text',
    },
    {
      name: 'Subjective',
      required: true,
      description:
        'Patient-reported symptoms, concerns, and interval history',
      format: 'text',
    },
    {
      name: 'Objective',
      required: true,
      description:
        'Vital signs, examination findings, laboratory results, imaging',
      format: 'text',
    },
    {
      name: 'Neurological Status',
      required: true,
      description:
        'Focused neurological examination and status changes (neurosurgery-specific)',
      format: 'text',
    },
    {
      name: 'Assessment',
      required: true,
      description:
        'Clinical impression, problem list, and clinical reasoning',
      format: 'text',
    },
    {
      name: 'Plan',
      required: true,
      description:
        'Orders, interventions, medications, disposition, and follow-up',
      format: 'text',
    },
  ],
};
