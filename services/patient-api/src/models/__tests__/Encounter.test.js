jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));

const { getDB } = require('../../utils/database');
const Encounter = require('../Encounter');

describe('Encounter appointment linkage', () => {
  test('persists the originating appointment id when creating a visit', async () => {
    const executor = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'encounter-id', appointment_id: 'appointment-id' }]
      })
    };
    getDB.mockReturnValue(executor);

    const encounter = await Encounter.create({
      patientId: 'patient-id',
      appointmentId: 'appointment-id',
      encounterType: 'outpatient'
    }, executor);

    const [sql, values] = executor.query.mock.calls[0];
    expect(sql).toMatch(/patient_id, appointment_id, encounter_type/);
    expect(values[2]).toBe('appointment-id');
    expect(encounter.appointment_id).toBe('appointment-id');
  });
});
