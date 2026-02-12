class StepsRecord {
  constructor(data = {}) {
    this.id = data.id ?? null;
    this.userId = data.user_id ?? data.userId ?? null;
    this.recordDate = data.record_date ?? data.recordDate ?? null;
    this.totalSteps = data.total_steps ?? data.totalSteps ?? null;
    this.distanceKm = data.distance_km ?? data.distanceKm ?? null;
    this.caloriesBurned = data.calories_burned ?? data.caloriesBurned ?? null;
    this.dailyGoal = data.daily_goal ?? data.dailyGoal ?? null;
    this.sourceType = data.source_type ?? data.sourceType ?? 'MANUAL';
    this.sourceId = data.source_id ?? data.sourceId ?? null;
    this.activeMinutes = data.active_minutes ?? data.activeMinutes ?? null;
    this.flightsClimbed = data.flights_climbed ?? data.flightsClimbed ?? null;
    this.avgHeartRate = data.avg_heart_rate ?? data.avgHeartRate ?? null;
    this.maxHeartRate = data.max_heart_rate ?? data.maxHeartRate ?? null;
    this.syncStatus = data.sync_status ?? data.syncStatus ?? 'NOT_SYNCED';
    this.lastSyncTime = data.last_sync_time ?? data.lastSyncTime ?? null;
    this.syncErrorMessage = data.sync_error_message ?? data.syncErrorMessage ?? null;
    this.createdAt = data.created_at ?? data.createdAt ?? null;
    this.updatedAt = data.updated_at ?? data.updatedAt ?? null;
    this.hourlySteps = data.hourlySteps ?? [];
    this.goalAchieved = data.goalAchieved ?? null;
    this.stepsDifference = data.stepsDifference ?? null;
    this.distanceDifference = data.distanceDifference ?? null;
    this.caloriesDifference = data.caloriesDifference ?? null;
  }

  toResponse() {
    return {
      id: this.id,
      userId: this.userId,
      recordDate: this.recordDate,
      totalSteps: this.totalSteps,
      distanceKm: this.distanceKm,
      caloriesBurned: this.caloriesBurned,
      dailyGoal: this.dailyGoal,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      activeMinutes: this.activeMinutes,
      flightsClimbed: this.flightsClimbed,
      avgHeartRate: this.avgHeartRate,
      maxHeartRate: this.maxHeartRate,
      syncStatus: this.syncStatus,
      lastSyncTime: this.lastSyncTime,
      syncErrorMessage: this.syncErrorMessage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      hourlySteps: this.hourlySteps,
      goalAchieved: this.goalAchieved,
      stepsDifference: this.stepsDifference,
      distanceDifference: this.distanceDifference,
      caloriesDifference: this.caloriesDifference
    };
  }
}

module.exports = StepsRecord;
