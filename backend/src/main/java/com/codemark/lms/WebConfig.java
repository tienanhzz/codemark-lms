package com.codemark.lms;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.web.cors.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class WebConfig {
  @Bean
  List<String> allowedOrigins(
      @Value("${codemark.origins}") String configured,
      @Value("${codemark.lan-origins}") String lan) {
    return Arrays.stream((configured + "," + lan).split(","))
        .map(String::trim)
        .filter(s -> !s.isBlank())
        .distinct()
        .toList();
  }

  @Bean
  org.springframework.web.filter.CorsFilter corsFilter(List<String> allowedOrigins) {
    var c = new CorsConfiguration();
    c.setAllowedOrigins(allowedOrigins);
    c.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    c.setAllowedHeaders(List.of("Content-Type"));
    c.setAllowCredentials(true);
    var source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", c);
    return new org.springframework.web.filter.CorsFilter(source);
  }

  @Bean
  OncePerRequestFilter originGuard(List<String> allowedOrigins) {
    return new OncePerRequestFilter() {
      @Override
      protected void doFilterInternal(
          HttpServletRequest r, HttpServletResponse s, FilterChain chain)
          throws java.io.IOException, ServletException {
        String origin = r.getHeader("Origin");
        if (r.getRequestURI().startsWith("/api/")
            && !Set.of("GET", "HEAD", "OPTIONS").contains(r.getMethod())
            && origin != null
            && !allowedOrigins.contains(origin)) {
          s.setStatus(403);
          s.setContentType("application/json");
          s.getWriter().write("{\"error\":\"origin_denied\"}");
          return;
        }
        chain.doFilter(r, s);
      }
    };
  }
}
