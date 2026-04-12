import { pgTable, text, serial, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sheetPhotosTable = pgTable("sheet_photos", {
  id: serial("id").primaryKey(),

  // ── Natural key from spreadsheet ────────────────────────────────────────
  photoId: text("photo_id").unique(),        // PhotoID (8-char hex)

  // ── File paths (relative to Drive root) ─────────────────────────────────
  photoUpload:       text("photo_upload"),
  resizedPhoto:      text("resized_photo"),
  signatureCapture:  text("signature_capture"),
  drawingMarkup:     text("drawing_markup"),

  // ── Resolved Drive file ID (populated on first resolve) ──────────────────
  driveFileId: text("drive_file_id"),

  // ── Wasabi object key (set once image is copied to Wasabi storage) ────────
  wasabiKey: text("wasabi_key"),

  // ── Location / phase linking ──────────────────────────────────────────────
  cableLink:    text("cable_link"),       // Photo_Cable_Link
  cableSide:    text("cable_side"),       // Photo_Cable_Side
  locationLink: text("location_link"),   // Photo_Location_Link
  photoType:    text("photo_type"),       // Photo_Type
  phaseLink:    text("phase_link"),       // Photo_Installation_Phase_Link
  phaseOrder:   text("phase_order"),      // Photo_Installation_Phase_Order
  photoString:  text("photo_string"),     // Photo_String

  // ── Required image fields ─────────────────────────────────────────────────
  reqImgType:  text("req_img_type"),
  reqImgOrder: text("req_img_order"),

  // ── Responses & notes ────────────────────────────────────────────────────
  photoResponse:          text("photo_response"),
  dataCaptureResponse:    text("data_capture_response"),
  comments:               text("comments"),
  terminationCompletedBy: text("termination_completed_by"),
  continuingNotes:        text("continuing_notes"),
  previousResponseImport: text("previous_response_import"),

  // ── Status & review ───────────────────────────────────────────────────────
  approval:      text("approval"),       // Photo_Approval
  status:        text("status"),         // Photo_Status
  reviewDetails: text("review_details"), // Photo_Review_Details

  // ── Label & hierarchy ─────────────────────────────────────────────────────
  label:         text("label"),          // Photo_Label
  parentControl: text("parent_control"), // Photo_Parent_Control
  parent:        text("parent"),         // Photo_Parent

  // ── Creation info ─────────────────────────────────────────────────────────
  creationDateTime: text("creation_date_time"),
  creationDate:     text("creation_date"),
  creationUser:     text("creation_user"),
  creationLocation: text("creation_location"),

  // ── Edit info ─────────────────────────────────────────────────────────────
  editCount:     text("edit_count"),
  editDateTime:  text("edit_date_time"),
  editDate:      text("edit_date"),
  editUser:      text("edit_user"),
  editLocation:  text("edit_location"),

  // ── System / misc fields ─────────────────────────────────────────────────
  updateFlag:        text("update_flag"),
  automationTrigger: text("automation_trigger"),
  formType:          text("form_type"),
  testFlag:          text("test_flag"),
  temp:              text("temp"),
  temp2:             text("temp2"),
  temp3:             text("temp3"),
  temp4:             text("temp4"),
  resizedChecked:    text("resized_checked"),

  // ── App-managed review fields (not overwritten on sheet sync) ────────────
  reviewComment: text("review_comment"),
  cropX:         real("crop_x"),
  cropY:         real("crop_y"),
  cropWidth:     real("crop_width"),
  cropHeight:    real("crop_height"),

  // ── Sync metadata ────────────────────────────────────────────────────────
  syncedAt:  timestamp("synced_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSheetPhotoSchema = createInsertSchema(sheetPhotosTable)
  .omit({ id: true, syncedAt: true, updatedAt: true });
export type InsertSheetPhoto = z.infer<typeof insertSheetPhotoSchema>;
export type SheetPhoto = typeof sheetPhotosTable.$inferSelect;
