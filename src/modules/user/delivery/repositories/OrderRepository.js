const pool = require('../../../../config/database');
const pointRepository = require('../../point/repositories/PointRepository');
const { notifyPointEarned } = require('../../notification/services/MemberNotifyService');

class OrderRepository {
  _notifyReceiptPoint(mbId, pointResult) {
    if (!pointResult?.granted || !pointResult?.needsNotify) return;
    const amount = Number(pointResult.poPoint || 0);
    if (amount <= 0) return;
    notifyPointEarned(mbId, amount).catch((e) => {
      console.error('[Order] 수령확인 적립 푸시 실패:', e?.message || e);
    });
  }
  bufferToString(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data).toString('utf8');
    }
    return String(value);
  }

  buildStatusFilter(status) {
    switch (status) {
      case 'payment':
        return {
          sql: "od_status IN ('주문', '입금') AND (od_cancel_price IS NULL OR od_cancel_price = 0) AND od_status NOT IN ('취소', '반품')",
          params: []
        };
      case 'cancel':
        return {
          sql: "od_status NOT IN ('주문', '입금', '준비', '배송', '완료')",
          params: []
        };
      case 'preparing':
        return {
          sql: "od_status IN ('준비') AND (od_cancel_price IS NULL OR od_cancel_price = 0) AND od_status NOT IN ('취소', '반품')",
          params: []
        };
      case 'delivering':
        return {
          sql: "od_status IN ('배송', '완료') AND (delivery_completed IS NULL OR delivery_completed != 1)",
          params: []
        };
      case 'finish':
        return {
          sql: 'delivery_completed = 1',
          params: []
        };
      default:
        return { sql: '1=1', params: [] };
    }
  }

  buildPeriodFilter(period) {
    if (!period || Number(period) <= 0) {
      return { sql: '1=1', params: [] };
    }
    return {
      sql: "NULLIF(od_time, '0000-00-00 00:00:00') >= DATE_SUB(NOW(), INTERVAL ? MONTH)",
      params: [Number(period)]
    };
  }

  async getOrders(mbId, period, status, page, size) {
    const statusFilter = this.buildStatusFilter(status);
    const periodFilter = this.buildPeriodFilter(period);
    const offset = Number(page) * Number(size);

    const whereSql = `mb_id = ? AND ${periodFilter.sql} AND ${statusFilter.sql}`;
    const whereParams = [mbId, ...periodFilter.params, ...statusFilter.params];

    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total FROM bomiora_shop_order WHERE ${whereSql}`,
        whereParams
      ),
      pool.query(
        `SELECT od_id, mb_id, od_name, od_hp,
                od_addr1, od_addr2, od_addr3, od_status,
                od_cart_count, od_cart_price, od_send_cost, od_send_cost2,
                od_receipt_price, od_settle_case,
                NULLIF(od_time, '0000-00-00 00:00:00') AS od_time,
                delivery_completed, admin_completed,
                NULLIF(auto_confirm_at, '0000-00-00 00:00:00') AS auto_confirm_at
         FROM bomiora_shop_order
         WHERE ${whereSql}
         ORDER BY od_id DESC
         LIMIT ? OFFSET ?`,
        [...whereParams, Number(size), offset]
      ),
    ]);

    return { rows, total: Number(countRows[0]?.total || 0) };
  }

  async getOrderDetail(odId, mbId) {
    const [rows] = await pool.query(
      `SELECT od_id, mb_id, od_name, od_email, od_tel, od_hp,
              od_zip1, od_zip2, od_addr1, od_addr2, od_addr3, od_addr_jibeon,
              od_b_name, od_b_tel, od_b_hp, od_b_zip1, od_b_zip2, od_b_addr1, od_b_addr2, od_b_addr3, od_b_addr_jibeon,
              od_memo, od_status, od_cart_count, od_cart_price, od_cart_coupon,
              od_send_cost, od_send_cost2, od_send_coupon, od_receipt_price, od_cancel_price, od_receipt_point, od_coupon, od_misu,
              od_settle_case, od_bank_account, od_deposit_name, od_delivery_company, od_invoice,
              od_pg, od_tno, od_app_no, od_test, od_other_pay_type,
              CASE
                WHEN od_status IN ('취소', '반품') THEN od_shop_memo
                ELSE NULL
              END AS od_shop_memo,
              CASE
                WHEN od_status IN ('취소', '반품') THEN od_mod_history
                ELSE NULL
              END AS od_mod_history,
              NULLIF(od_time, '0000-00-00 00:00:00') AS od_time,
              NULLIF(od_invoice_time, '0000-00-00 00:00:00') AS od_invoice_time,
              NULLIF(od_receipt_time, '0000-00-00 00:00:00') AS od_receipt_time,
              delivery_completed, admin_completed,
              NULLIF(auto_confirm_at, '0000-00-00 00:00:00') AS auto_confirm_at
       FROM bomiora_shop_order
       WHERE od_id = ? AND mb_id = ?
       LIMIT 1`,
      [odId, mbId]
    );
    return rows.length ? rows[0] : null;
  }

  async findById(odId) {
    const [rows] = await pool.query('SELECT * FROM bomiora_shop_order WHERE od_id = ? LIMIT 1', [odId]);
    return rows.length ? rows[0] : null;
  }

  async updateOrder(odId, fields) {
    const sets = [];
    const values = [];
    Object.entries(fields).forEach(([key, value]) => {
      sets.push(`${key} = ?`);
      values.push(value);
    });
    if (!sets.length) return;
    values.push(odId);
    await pool.query(`UPDATE bomiora_shop_order SET ${sets.join(', ')} WHERE od_id = ?`, values);
  }

  async getItemImagesByItIds(itIds) {
    if (!itIds.length) return [];
    const placeholders = itIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT it_id, it_img1 FROM bomiora_shop_item_new WHERE it_id IN (${placeholders})`,
      itIds
    );
    return rows;
  }

  async getReservation(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT hp_rsvt_date, hp_rsvt_stime, hp_rsvt_etime
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND od_id = ?
       ORDER BY hp_no DESC
       LIMIT 1`,
      [mbId, odId]
    );
    return rows.length ? rows[0] : null;
  }

  /**
   * 주문 상세용: 비대면/상담완료 + 예약정보를 한 번에 조회
   * KCP 결제 전 임시 od_id 로 저장된 행이 있으면 주문 상품(it_id)으로 찾아 재연결
   */
  async getHealthAndReservation(mbId, odId) {
    const odIdStr = String(odId ?? '').replace(/[^0-9]/g, '').trim();
    let [rows] = await pool.query(
      `SELECT hp_no, hp_9, hp_10, hp_mdatetime, hp_rsvt_date, hp_rsvt_stime, hp_rsvt_etime
         FROM bomiora_shop_health_profiles_cart
        WHERE mb_id = ?
          AND REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') = ?
        ORDER BY hp_no DESC`,
      [mbId, odIdStr]
    );

    // 결제 확정 od_id 미연결(임시 od_id 잔존) 보정
    if (!rows.length && odIdStr) {
      const [cartItems] = await pool.query(
        `SELECT DISTINCT it_id
           FROM bomiora_shop_cart
          WHERE mb_id = ?
            AND REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') = ?`,
        [mbId, odIdStr]
      );
      const itIds = (Array.isArray(cartItems) ? cartItems : [])
        .map((row) => String(row.it_id ?? '').trim())
        .filter(Boolean);

      if (itIds.length) {
        const placeholders = itIds.map(() => '?').join(', ');
        const [orphans] = await pool.query(
          `SELECT hp_no, hp_9, hp_10, hp_mdatetime, hp_rsvt_date, hp_rsvt_stime, hp_rsvt_etime
             FROM bomiora_shop_health_profiles_cart
            WHERE mb_id = ?
              AND it_id IN (${placeholders})
              AND hp_rsvt_date IS NOT NULL
              AND CAST(hp_rsvt_date AS CHAR) NOT IN ('', '0000-00-00')
              AND (
                od_id IS NULL OR od_id = '' OR od_id = '0'
                OR REPLACE(REPLACE(CAST(od_id AS CHAR), ',', ''), ' ', '') NOT IN (
                  SELECT o.od_id FROM bomiora_shop_order o WHERE o.mb_id = ?
                )
              )
            ORDER BY hp_no DESC`,
          [mbId, ...itIds, mbId]
        );

        if (Array.isArray(orphans) && orphans.length) {
          const healNos = orphans.map((row) => Number(row.hp_no)).filter((n) => n > 0);
          if (healNos.length) {
            const healPlaceholders = healNos.map(() => '?').join(', ');
            await pool.query(
              `UPDATE bomiora_shop_health_profiles_cart
                  SET od_id = ?, hp_mdatetime = NOW()
                WHERE mb_id = ?
                  AND hp_no IN (${healPlaceholders})`,
              [odIdStr, mbId, ...healNos]
            );
          }
          rows = orphans;
        }
      }
    }

    const isPrescriptionOrder = rows.length > 0;
    let isConsultationDone = false;
    for (const row of rows) {
      const hp9 = String(row.hp_9 || '').trim();
      const hp10 = String(row.hp_10 || '').trim();
      const md = row.hp_mdatetime;
      const hasMd =
        md != null &&
        String(md) !== '' &&
        String(md) !== '0000-00-00 00:00:00';
      if (hp9 === 'prescription' && hp10 === 'completion' && hasMd) {
        isConsultationDone = true;
        break;
      }
    }

    const top = rows[0] || null;
    return {
      isPrescriptionOrder,
      isConsultationDone,
      reservation: top
        ? {
            hp_rsvt_date: top.hp_rsvt_date,
            hp_rsvt_stime: top.hp_rsvt_stime,
            hp_rsvt_etime: top.hp_rsvt_etime,
          }
        : null,
    };
  }

  /**
   * 비대면(건강문진) 주문 여부 + 상담완료 여부.
   * 상담완료: hp_9=prescription, hp_10=completion, hp_mdatetime 존재
   * (diagnosis2_list_update.php 처방 저장 규칙과 동일)
   */
  async getHealthProfileFlagsByOdIds(mbId, odIds) {
    if (!odIds.length) return {};
    const placeholders = odIds.map(() => '?').join(', ');
    const [rows] = await pool.query(
      `SELECT od_id,
              1 AS is_telemedicine,
              MAX(CASE
                    WHEN hp_9 = 'prescription'
                     AND hp_10 = 'completion'
                     AND hp_mdatetime IS NOT NULL
                     AND hp_mdatetime <> '0000-00-00 00:00:00'
                    THEN 1 ELSE 0
                  END) AS is_consultation_done
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND od_id IN (${placeholders})
       GROUP BY od_id`,
      [mbId, ...odIds]
    );
    const map = {};
    rows.forEach((row) => {
      map[String(row.od_id)] = {
        isPrescriptionOrder: Number(row.is_telemedicine || 0) === 1,
        isConsultationDone: Number(row.is_consultation_done || 0) === 1,
      };
    });
    return map;
  }

  /** @deprecated use getHealthProfileFlagsByOdIds — 하위 호환 */
  async getPrescriptionFlagsByOdIds(mbId, odIds) {
    const flags = await this.getHealthProfileFlagsByOdIds(mbId, odIds);
    const map = {};
    Object.keys(flags).forEach((odId) => {
      map[odId] = flags[odId].isPrescriptionOrder === true;
    });
    return map;
  }

  /** 비대면 진료 주문 여부 (health_profiles_cart 존재) */
  async isPrescriptionOrder(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ? AND od_id = ?
       LIMIT 1`,
      [mbId, odId]
    );
    return rows.length > 0;
  }

  /** 상담(처방) 완료 여부 */
  async isConsultationDone(mbId, odId) {
    const [rows] = await pool.query(
      `SELECT 1
       FROM bomiora_shop_health_profiles_cart
       WHERE mb_id = ?
         AND od_id = ?
         AND hp_9 = 'prescription'
         AND hp_10 = 'completion'
         AND hp_mdatetime IS NOT NULL
         AND hp_mdatetime <> '0000-00-00 00:00:00'
       LIMIT 1`,
      [mbId, odId]
    );
    return rows.length > 0;
  }

  async getAddressById(mbId, addressId) {
    const [rows] = await pool.query(
      `SELECT ad_id, ad_name, ad_tel, ad_hp, ad_zip1, ad_zip2, ad_addr1, ad_addr2, ad_addr3, ad_jibeon
       FROM bomiora_shop_order_address
       WHERE mb_id = ? AND ad_id = ?
       LIMIT 1`,
      [mbId, addressId]
    );
    return rows.length ? rows[0] : null;
  }

  async updateOrderAddress(odId, mbId, address) {
    const [result] = await pool.query(
      `UPDATE bomiora_shop_order
       SET od_name = ?, od_tel = ?, od_hp = ?, od_zip1 = ?, od_zip2 = ?,
           od_addr1 = ?, od_addr2 = ?, od_addr3 = ?, od_addr_jibeon = ?
       WHERE od_id = ? AND mb_id = ?`,
      [
        address.ad_name || '',
        address.ad_tel || '',
        address.ad_hp || '',
        address.ad_zip1 || '',
        address.ad_zip2 || '',
        address.ad_addr1 || '',
        address.ad_addr2 || '',
        address.ad_addr3 || '',
        address.ad_jibeon || '',
        odId,
        mbId
      ]
    );
    return result.affectedRows > 0;
  }

  /** 배송요청사항(od_memo) 변경 */
  async updateOrderMemo(odId, mbId, memo) {
    const [result] = await pool.query(
      `UPDATE bomiora_shop_order
       SET od_memo = ?
       WHERE od_id = ? AND mb_id = ?`,
      [String(memo ?? ''), odId, mbId]
    );
    return result.affectedRows > 0;
  }

  async updateReservation(mbId, odId, date, time) {
    const [result] = await pool.query(
      `UPDATE bomiora_shop_health_profiles_cart
       SET hp_rsvt_date = ?, hp_rsvt_stime = ?, hp_mdatetime = NOW()
       WHERE mb_id = ? AND od_id = ?`,
      [date, time, mbId, odId]
    );
    return result.affectedRows > 0;
  }

  /**
   * 고객 수령확인 (웹 mypage/order_completion.php 와 동일)
   * @returns {{ already: boolean, auto: boolean, order: object }}
   */
  async confirmOrderReceipt(odId, mbId, options = {}) {
    const actorId = String(options.actorId || mbId || '').trim() || mbId;
    const clientIp = String(options.clientIp || '').trim();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [orderRows] = await conn.query(
        `SELECT od_id, mb_id, od_status, delivery_completed, auto_confirm_at, admin_completed
         FROM bomiora_shop_order
         WHERE od_id = ? AND mb_id = ?
         LIMIT 1
         FOR UPDATE`,
        [odId, mbId]
      );
      if (!orderRows.length) {
        const err = new Error('주문을 찾을 수 없습니다.');
        err.statusCode = 404;
        throw err;
      }

      const order = orderRows[0];
      const odStatus = this.bufferToString(order.od_status).trim();
      const deliveryCompleted = Number(order.delivery_completed || 0) === 1;

      if (deliveryCompleted) {
        const err = new Error('이미 수령확인이 완료된 주문입니다.');
        err.statusCode = 400;
        err.code = 'ALREADY_COMPLETED';
        throw err;
      }

      if (!['배송', '완료'].includes(odStatus)) {
        const err = new Error('수령확인할 수 없는 주문 상태입니다.');
        err.statusCode = 400;
        err.code = 'INVALID_STATUS';
        throw err;
      }

      const autoAt = order.auto_confirm_at;
      const autoExpired =
        autoAt != null &&
        String(autoAt) !== '' &&
        String(autoAt) !== '0000-00-00 00:00:00' &&
        new Date(autoAt).getTime() <= Date.now();

      // 자동확정 기한 경과: 웹과 같이 자동 처리 후 안내
      if (autoExpired) {
        await conn.query(
          `UPDATE bomiora_shop_order
           SET delivery_completed = 1,
               delivery_completed_at = COALESCE(NULLIF(auto_confirm_at, '0000-00-00 00:00:00'), NOW()),
               od_status = '완료',
               auto_confirm_at = NULL
           WHERE od_id = ? AND mb_id = ?`,
          [odId, mbId]
        );
        await conn.query(
          `UPDATE bomiora_shop_cart
           SET ct_status = '완료'
           WHERE od_id = ? AND mb_id = ?`,
          [odId, mbId]
        );

        let pointResult = null;
        try {
          pointResult = await pointRepository.grantOrderReceiptPoint({
            mbId,
            odId,
            conn,
          });
        } catch (e) {
          console.error(
            '[Order] 자동수령확정 포인트 적립 실패:',
            e?.message || e
          );
        }

        await conn.commit();
        this._notifyReceiptPoint(mbId, pointResult);
        return {
          auto: true,
          already: false,
          point: pointResult,
          order: {
            od_id: odId,
            od_status: '완료',
            delivery_completed: 1,
          },
        };
      }

      const [cartRows] = await conn.query(
        `SELECT ct_id, it_id, io_id, io_type, ct_qty, ct_stock_use, ct_point_use, ct_point, ct_history
         FROM bomiora_shop_cart
         WHERE od_id = ? AND mb_id = ?
         ORDER BY ct_id ASC
         FOR UPDATE`,
        [odId, mbId]
      );

      const now = this._formatLocalDateTime(new Date());
      const itIds = [];

      for (const ct of cartRows) {
        let stockUse = Number(ct.ct_stock_use || 0);
        const qty = Number(ct.ct_qty || 0);
        const ioId = ct.io_id != null ? String(ct.io_id).trim() : '';
        const ioType = ct.io_type != null ? Number(ct.io_type) : 0;

        // 재고 미차감이면 완료 시점에 차감 (웹 order_completion.php)
        if (!stockUse && qty > 0) {
          stockUse = 1;
          if (ioId) {
            await conn.query(
              `UPDATE bomiora_shop_item_option
               SET io_stock_qty = io_stock_qty - ?
               WHERE it_id = ? AND io_id = ? AND io_type = ?`,
              [qty, ct.it_id, ioId, ioType]
            );
          } else {
            await conn.query(
              `UPDATE bomiora_shop_item_new
               SET it_stock_qty = it_stock_qty - ?
               WHERE it_id = ?`,
              [qty, ct.it_id]
            );
          }
        }

        // 웹: 이미 지급된 배송포인트 플래그 정리 (포인트 원장 삭제는 생략 — 수령확정 시 차감 부작용 방지)
        const pointUse = Number(ct.ct_point_use || 0);
        const historyLine = `\n완료|${actorId}|${now}|${clientIp}`;

        await conn.query(
          `UPDATE bomiora_shop_cart
           SET ct_point_use = ?,
               ct_stock_use = ?,
               ct_status = '완료',
               ct_history = CONCAT(IFNULL(ct_history, ''), ?)
           WHERE od_id = ? AND ct_id = ?`,
          [pointUse, stockUse, historyLine, odId, ct.ct_id]
        );

        if (ct.it_id) itIds.push(String(ct.it_id));
      }

      const uniqueItIds = [...new Set(itIds)];
      for (const itId of uniqueItIds) {
        const [sumRows] = await conn.query(
          `SELECT COALESCE(SUM(ct_qty), 0) AS sum_qty
           FROM bomiora_shop_cart
           WHERE it_id = ? AND ct_status = '완료'`,
          [itId]
        );
        const sumQty = Number(sumRows[0]?.sum_qty || 0);
        await conn.query(
          `UPDATE bomiora_shop_item_new SET it_sum_qty = ? WHERE it_id = ?`,
          [sumQty, itId]
        );

        // health_profiles_cart.ct_status 컬럼이 없는 환경도 있어 실패는 무시
        try {
          await conn.query(
            `UPDATE bomiora_shop_health_profiles_cart
             SET ct_status = '완료'
             WHERE od_id = ? AND it_id = ?`,
            [odId, itId]
          );
        } catch (_) {
          /* optional column */
        }
      }

      await conn.query(
        `UPDATE bomiora_shop_order
         SET od_status = '완료',
             delivery_completed = 1,
             delivery_completed_at = NOW(),
             auto_confirm_at = NULL
         WHERE od_id = ? AND mb_id = ?`,
        [odId, mbId]
      );

      let pointResult = null;
      try {
        pointResult = await pointRepository.grantOrderReceiptPoint({
          mbId,
          odId,
          conn,
        });
      } catch (e) {
        console.error('[Order] 수령확인 포인트 적립 실패:', e?.message || e);
      }

      await conn.commit();
      this._notifyReceiptPoint(mbId, pointResult);
      return {
        auto: false,
        already: false,
        point: pointResult,
        order: {
          od_id: odId,
          od_status: '완료',
          delivery_completed: 1,
        },
      };
    } catch (error) {
      try {
        await conn.rollback();
      } catch (_) {
        /* ignore */
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  /** 자동 수령확정 대상 일괄 처리 (크론/배치) */
  async processDueAutoConfirms(limit = 100) {
    const [rows] = await pool.query(
      `SELECT od_id, mb_id
       FROM bomiora_shop_order
       WHERE (delivery_completed IS NULL OR delivery_completed = 0)
         AND od_status IN ('배송', '완료')
         AND auto_confirm_at IS NOT NULL
         AND auto_confirm_at <> '0000-00-00 00:00:00'
         AND auto_confirm_at <= NOW()
       ORDER BY auto_confirm_at ASC
       LIMIT ?`,
      [Number(limit) || 100]
    );

    const results = { processed: 0, failed: 0, odIds: [] };
    for (const row of rows) {
      const odId = String(row.od_id);
      const mbId = String(row.mb_id || '').trim();
      try {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await conn.query(
            `UPDATE bomiora_shop_order
             SET delivery_completed = 1,
                 delivery_completed_at = COALESCE(NULLIF(auto_confirm_at, '0000-00-00 00:00:00'), NOW()),
                 od_status = '완료',
                 auto_confirm_at = NULL
             WHERE od_id = ? AND mb_id = ?
               AND (delivery_completed IS NULL OR delivery_completed = 0)`,
            [odId, mbId]
          );
          await conn.query(
            `UPDATE bomiora_shop_cart
             SET ct_status = '완료'
             WHERE od_id = ? AND mb_id = ?`,
            [odId, mbId]
          );
          let pointResult = null;
          try {
            pointResult = await pointRepository.grantOrderReceiptPoint({
              mbId,
              odId,
              conn,
            });
          } catch (e) {
            console.error(
              '[Order] 배치 자동수령 포인트 적립 실패:',
              odId,
              e?.message || e
            );
          }
          await conn.commit();
          this._notifyReceiptPoint(mbId, pointResult);
          results.processed += 1;
          results.odIds.push(odId);
        } catch (e) {
          await conn.rollback();
          results.failed += 1;
        } finally {
          conn.release();
        }
      } catch (_) {
        results.failed += 1;
      }
    }
    return results;
  }

  _formatLocalDateTime(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
}

module.exports = new OrderRepository();
