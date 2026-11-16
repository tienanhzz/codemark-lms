package com.codemark.lms;

import java.nio.file.*;
import java.sql.*;
import javax.sql.DataSource;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;

/** Runs before Hibernate changes the old schema. Never invents student codes. */
@Configuration
class IdentityMigration {
  @Bean static BeanFactoryPostProcessor migrationOrder() {
    return factory -> factory.getBeanDefinition("entityManagerFactory").setDependsOn("identityMigrationRun");
  }
  @Bean String identityMigrationRun(DataSource source) throws Exception {
    try (Connection c = source.getConnection()) {
      migrateAssessmentWeight(c);
      boolean old = false;
      try (ResultSet columns = c.getMetaData().getColumns(null, null, "%", "%")) {
        while (columns.next()) {
          if (columns.getString("TABLE_NAME").equalsIgnoreCase("cf_user") && columns.getString("COLUMN_NAME").equalsIgnoreCase("email")) old = true;
        }
      }
      if (!old) return "unchanged";
      // H2 creates a consistent, complete SQL backup while connected.
      Path backups = Path.of("instance", "backups").toAbsolutePath();
      Files.createDirectories(backups);
      String product = c.getMetaData().getDatabaseProductName();
      if (!product.equals("H2")) throw new IllegalStateException("Run scripts/migrate-mariadb.ps1 before starting this database");
      String file = backups.resolve("before-identity-" + System.currentTimeMillis() + ".sql").toString().replace("'", "''");
      try (Statement s = c.createStatement()) {
        s.execute("SCRIPT TO '" + file + "'");
        s.execute("ALTER TABLE cf_user ADD COLUMN IF NOT EXISTS student_id VARCHAR(255)");
        s.execute("ALTER TABLE cf_user ADD COLUMN IF NOT EXISTS pending_code BOOLEAN DEFAULT TRUE NOT NULL");
        s.execute("ALTER TABLE cf_user ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE NOT NULL");
        s.execute("UPDATE cf_user SET pending_code=TRUE WHERE student_id IS NULL");
        // Upgrade an old plaintext password only after the full backup succeeded.
        var encoder=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        try (ResultSet users=s.executeQuery("SELECT id,password_hash FROM cf_user");
             PreparedStatement update=c.prepareStatement("UPDATE cf_user SET password_hash=?,must_change_password=TRUE WHERE id=?")) {
          while(users.next()) {
            String hash=users.getString(2);
            if(hash!=null && !hash.matches("^\\$2[aby]\\$.*")) {
              Api.require(hash.getBytes(java.nio.charset.StandardCharsets.UTF_8).length<=72,"legacy_password_too_long",400);
              update.setString(1,encoder.encode(hash)); update.setLong(2,users.getLong(1)); update.executeUpdate();
            }
          }
        }
        s.execute("ALTER TABLE cf_user DROP COLUMN email");
      }
      return "migrated";
    }
  }

  // A Java field initializer only applies to new objects, not rows already in the database.
  void migrateAssessmentWeight(Connection c) throws Exception {
    boolean tableExists=false, columnExists=false;
    try(ResultSet columns=c.getMetaData().getColumns(null,null,"%","%")) {
      while(columns.next()) {
        if(columns.getString("TABLE_NAME").equalsIgnoreCase("cf_assessment")) {
          tableExists=true;
          if(columns.getString("COLUMN_NAME").equalsIgnoreCase("rank_weight")) columnExists=true;
        }
      }
    }
    if(!tableExists) return;
    boolean needsRepair=!columnExists;
    if(columnExists) {
      try(Statement s=c.createStatement();ResultSet rows=s.executeQuery("SELECT COUNT(*) FROM cf_assessment WHERE rank_weight IS NULL")) {
        rows.next(); needsRepair=rows.getLong(1)>0;
      }
    }
    if(!needsRepair) return;
    if(!c.getMetaData().getDatabaseProductName().equals("H2"))
      throw new IllegalStateException("Run scripts/migrate-mariadb.ps1 to add assessment rank_weight before startup");
    Path backups=Path.of("instance","backups").toAbsolutePath();
    Files.createDirectories(backups);
    String file=backups.resolve("before-rank-weight-"+System.currentTimeMillis()+".sql").toString().replace("'","''");
    try(Statement s=c.createStatement()) {
      s.execute("SCRIPT TO '"+file+"'");
      s.execute("ALTER TABLE cf_assessment ADD COLUMN IF NOT EXISTS rank_weight DOUBLE PRECISION DEFAULT 1 NOT NULL");
      s.execute("UPDATE cf_assessment SET rank_weight=1 WHERE rank_weight IS NULL");
    }
  }
}
