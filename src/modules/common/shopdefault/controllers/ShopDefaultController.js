const shopDefaultRepository = require('../repositories/ShopDefaultRepository');

class ShopDefaultController {
  normalizeTimeValue(timeValue) {
    if (timeValue == null) return null;

    const raw = Buffer.isBuffer(timeValue)
      ? timeValue.toString('utf8')
      : String(timeValue);

    // Keep Flutter contract stable as HH:mm
    if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
      return raw.slice(0, 5);
    }

    return raw;
  }

  createDaySettings(startTime, endTime, active) {
    return {
      start_time: this.normalizeTimeValue(startTime),
      end_time: this.normalizeTimeValue(endTime),
      active: Number(active || 0) === 1
    };
  }

  async getReservationSettings(req, res) {
    try {
      const row = await shopDefaultRepository.findFirst();
      if (!row) return res.json({});

      const settings = {
        monday: this.createDaySettings(row.de_rsvt_mon_stime, row.de_rsvt_mon_etime, row.de_rsvt_mon_act),
        tuesday: this.createDaySettings(row.de_rsvt_tue_stime, row.de_rsvt_tue_etime, row.de_rsvt_tue_act),
        wednesday: this.createDaySettings(row.de_rsvt_wed_stime, row.de_rsvt_wed_etime, row.de_rsvt_wed_act),
        thursday: this.createDaySettings(row.de_rsvt_thu_stime, row.de_rsvt_thu_etime, row.de_rsvt_thu_act),
        friday: this.createDaySettings(row.de_rsvt_fri_stime, row.de_rsvt_fri_etime, row.de_rsvt_fri_act),
        saturday: this.createDaySettings(row.de_rsvt_sat_stime, row.de_rsvt_sat_etime, row.de_rsvt_sat_act),
        sunday: this.createDaySettings(row.de_rsvt_sun_stime, row.de_rsvt_sun_etime, row.de_rsvt_sun_act),
        lunch: {
          start_time: this.normalizeTimeValue(row.de_rsvt_lunch_stime),
          end_time: this.normalizeTimeValue(row.de_rsvt_lunch_etime)
        },
        holiday: this.createDaySettings(row.de_rsvt_holiday_stime, row.de_rsvt_holiday_etime, row.de_rsvt_holiday_act),
        relay_time: row.de_rsvt_grelay_time != null ? Number(row.de_rsvt_grelay_time) : 30,
        limit_person: row.de_rsvt_limit_person != null ? Number(row.de_rsvt_limit_person) : 15
      };

      return res.json(settings);
    } catch (error) {
      return res.json({});
    }
  }
}

module.exports = new ShopDefaultController();
