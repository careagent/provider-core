import type { ChartTemplate } from '../../types.js';

export const operativeNoteTemplate: ChartTemplate = {
  templateId: 'operative-note',
  name: 'Operative Note',
  version: '1.0.0',
  sections: [
    {
      name: 'Date of Procedure',
      required: true,
      description: 'Date the procedure was performed',
      format: 'text',
    },
    {
      name: 'Preoperative Diagnosis',
      required: true,
      description: 'Diagnosis prior to the procedure',
      format: 'text',
    },
    {
      name: 'Postoperative Diagnosis',
      required: true,
      description: 'Diagnosis after the procedure',
      format: 'text',
    },
    {
      name: 'Procedure Performed',
      required: true,
      description: 'Name and description of the procedure performed',
      format: 'text',
    },
    {
      name: 'Surgeon',
      required: true,
      description: 'Name and credentials of primary surgeon',
      format: 'text',
    },
    {
      name: 'Assistant(s)',
      required: false,
      description: 'Assisting surgeons or personnel',
      format: 'text',
    },
    {
      name: 'Anesthesia',
      required: true,
      description: 'Type of anesthesia administered',
      format: 'text',
    },
    {
      name: 'Indications',
      required: true,
      description: 'Clinical reason and necessity for the procedure',
      format: 'text',
    },
    {
      name: 'Description of Procedure',
      required: true,
      description:
        'Step-by-step narrative of the surgical procedure including approach, positioning, and technique',
      format: 'text',
    },
    {
      name: 'Findings',
      required: true,
      description:
        'Intraoperative findings including pathology encountered',
      format: 'text',
    },
    {
      name: 'Specimens',
      required: false,
      description: 'Specimens collected during the procedure',
      format: 'list',
    },
    {
      name: 'Implants/Hardware',
      required: false,
      description:
        'Implants, hardware, or devices placed (neurosurgery-specific)',
      format: 'list',
    },
    {
      name: 'Estimated Blood Loss',
      required: true,
      description: 'Estimated blood loss during the procedure',
      format: 'text',
    },
    {
      name: 'Fluids/Drains',
      required: false,
      description:
        'IV fluids administered and drains placed (neurosurgery-specific)',
      format: 'text',
    },
    {
      name: 'Neuromonitoring',
      required: false,
      description:
        'Intraoperative neuromonitoring modalities and findings (neurosurgery-specific)',
      format: 'text',
    },
    {
      name: 'Complications',
      required: true,
      description: 'Intraoperative complications or "None"',
      format: 'text',
    },
    {
      name: 'Disposition',
      required: true,
      description:
        'Patient condition and disposition at end of procedure',
      format: 'text',
    },
  ],
};
